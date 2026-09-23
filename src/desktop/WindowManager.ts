/**
 * 窗口注册表 + 状态机 + z-order + 焦点 + 几何写入.
 *
 * 两条硬约束(继承自 `PanelController`,它当年就是为了修"模型与 DOM 分叉"):
 *
 * 1. **几何的唯一写入点**是 `_applyGeometry`:普通态把 `geometry` 逐条写进
 *    `left/top/width/height`;`maximized` 态**清掉**这四条行内属性
 *    (几何交给 `.is-maximized` 的 `inset`).它不写类名,也**不碰 `z-index`**.
 * 2. **状态的唯一写入点**是 `_applyState`:`.window` 上的每一个类(除
 *    `.is-focused`)都在这里切,并刷新 `inert` / `aria-hidden` /
 *    Dock 的激活态与隐藏态.
 *
 * `z-index` 有第三个写入点:`focus()`.几何写入会清行内属性,两者必须分开,
 * 否则会出现"拖动第一帧窗口就掉到后面"(见 docs/windowing-plan.md §11.2 E8).
 */
import { type DesktopConfig, type WindowConfigEntry, type WindowId, type WindowSlot } from './types';
import { bindDragGesture } from '../shared/dragGesture';
import { childNodes, type Child } from '../widgets/dom';
import { createDock, type DockHandle } from './Dock';
import {
    clampGeometry,
    fitGeometry,
    magnetize,
    moveGeometry,
    resolveDefaultGeometry,
    resolveEdgeSnap,
    type Desktop,
    type Geometry,
    type Limits,
    type SnapKind,
} from './WindowGeometry';
import { clearGeometry, createWindowFrame, writeGeometry, type WindowActionButton, type WindowFrameHandle } from './WindowFrame';
import { bindWindowResize } from './WindowResize';
import { createSnapPreview, type SnapPreviewHandle } from './SnapPreview';

/**
 * 窗口状态.
 *
 * 只有三种:没有真正的进程可关,`closed` 与 `minimized` 是同一件事(藏起来),
 * `fullscreen` 与 `maximized` 的区别也只剩"遮不遮顶部任务栏"--而任务栏不该被
 * 遮,所以后两者连同对应动作一起删掉了.
 */
export type WindowState = 'normal' | 'maximized' | 'minimized';

/**
 * 标题栏"双击最大化"的判定阈值(ms).
 *
 * 为什么不用 `dblclick`:拖动件在 `pointerdown` 里 `preventDefault()`(为了
 * 不选中标题文字),而浏览器正是在这一步决定要不要继续派发兼容鼠标事件,
 * 双击能不能到 `dblclick` 就变成了实现细节.按"两次 pointerdown 的间隔"判定
 * 不依赖任何兼容事件,触屏也照样成立(§10 原本担心的正是这个).
 */
const DOUBLE_CLICK_MS = 300;

/** 一个窗口标题栏要搬进去的现成节点,按槽位分组(词表见 `desktop/types.ts`). */
export type WindowContent = Partial<Record<WindowSlot, readonly Child[]>>;

/**
 * 一个窗口的内容:标题栏槽位 + 正文节点.
 *
 * 正文节点是**搬过来的,不是重建的**(监听/状态/引用都不能丢),库只负责把
 * `.window-body` 建好再 `append`.正文容器由库自己建,所以消费者不再需要事先在
 * HTML 里写一个带 id 的宿主(D1) —— `index.html` 因此能缩到一个 `#app`.
 */
export interface WindowContentSpec {
    /** 标题栏槽位节点;缺省 = 不搬节点. */
    readonly slots?: WindowContent;
    /** 正文节点;缺省 = 空正文. */
    readonly body?: readonly Child[];
}

/**
 * 按窗口 id 取该窗口的内容.
 *
 * 节点的所有者是消费者(--> 应用侧的内容工厂),`WindowManager` 既不按 id 猜
 * 它们的位置,也不管它们从哪来;它只把拿到的节点 `append` 进对应槽位与正文.
 */
export type WindowContentProvider = (id: WindowId) => WindowContentSpec;

interface Entry {
    readonly spec: WindowConfigEntry;
    readonly frame: WindowFrameHandle;
    /** 消费者给的正文节点:`dispose()` 时原样还回桌面根,不留在被删的外壳里. */
    readonly content: readonly Node[];
    /** 唯一几何真相源(普通态);最大化/最小化不改它. */
    geometry: Geometry;
    /** 进入 maximized 前的几何,还原用. */
    restore: Geometry | null;
    state: WindowState;
    /** 每个窗口一份:拖动/缩放的指针监听在它上面 abort. */
    readonly gesture: AbortController;
    /** 该窗口当前的 z-index(`focus()` 写;几何写入不得碰它). */
    zIndex: number;
}

/** 一次拖动里"松开会落到哪"的临时结论(不写进 entry.geometry). */
interface PendingSnap {
    readonly id: WindowId;
    readonly kind: SnapKind;
    readonly target: Geometry;
}

export class WindowManager {
    private readonly entries = new Map<WindowId, Entry>();
    private readonly geometryListeners = new Set<(id: WindowId) => void>();
    private readonly abort = new AbortController();
    private dock: DockHandle | null = null;
    private snapPreview: SnapPreviewHandle | null = null;
    private root: HTMLElement | null = null;
    private desktop: Desktop = { w: 0, h: 0, dockReserve: 0, edgeGap: 0 };
    private z = 0;
    private focusedId: WindowId | null = null;
    private pendingSnap: PendingSnap | null = null;
    /** 每个窗口上一次"标题栏按下"的时间戳,只服务双击判定. */
    private readonly lastTitleDown = new Map<WindowId, number>();
    /** `bind()` 只允许生效一次(见该方法). */
    private bound = false;

    /**
     * @param config       桌面配置(窗口清单/动作/夹取常量/z 与吸附参数);
     *                     由消费者传入,本类不读任何模块级单例(D4)
     * @param layer        `.window-layer`:窗口的定位参照与 z-order 层
     * @param dockElement  `.dock`:顶部任务栏容器
     * @param snapElement  `.snap-preview`:吸附高亮层
     * @param content      各窗口的内容提供者(标题栏槽位 + 正文节点);
     *                     正文容器 `.window-body` 由本类自己建(D1)
     */
    constructor(
        private readonly config: DesktopConfig,
        private readonly layer: HTMLElement,
        private readonly dockElement: HTMLElement,
        private readonly snapElement: HTMLElement,
        private readonly content: WindowContentProvider,
    ) {}

    /**
     * 建 frame + 搬正文 + 建 Dock + 起初始焦点 + 挂 resize.
     *
     * 顺序不能换:①先算全部默认几何(数组顺序即依赖顺序);②建 frame,把
     * `content` 给的标题栏节点放进对应槽位、正文节点 append 进 `.window-body`;
     * ③Dock;④初始焦点(没有焦点就没有 z 序参照).
     */
    bind(): void {
        if (this.bound) {
            throw new Error(
                'WindowManager: bind() 只能调用一次;dispose() 之后不支持重建'
                + '(监听用的 AbortController 已经 abort,再 bind 会静默产出不可交互的窗口)',
            );
        }
        this.bound = true;

        const root = this.layer.parentElement;
        if (!root) throw new Error('WindowManager: .window-layer 必须挂在桌面容器里');
        this.root = root;
        this.desktop = this._measureDesktop();

        // 三层容器的 z-index 来自配置(唯一来源):层必须在视口之上,Dock 在层
        // 之上;吸附预览在层**之下**(见 config.z 的说明).窗口之间
        // 的取号由 focus() 独占写入.
        this.layer.style.zIndex = String(this.config.z.windowLayer);
        this.snapElement.style.zIndex = String(this.config.z.snapPreview);
        this.dockElement.style.zIndex = String(this.config.z.dock);

        // CSS 必须自己读的两个尺寸(任务栏高度 / 标题栏高度)也从 config 落到
        // root 的 CSS 变量上:它们是同一份数被 JS 几何与 CSS 各消费一次.
        this._writeShellVars(root);

        // z 取号的起点:每个实例各自从 config 给的第一号开始(不写字段初始化器,
        // 因为那时构造参数属性还没赋值).
        this.z = this.config.z.first;

        // 1) 默认几何:数组顺序即依赖顺序(view 依赖 source,process 依赖 params).
        const resolved = new Map<WindowId, Geometry>();
        for (const spec of this.config.windows) {
            resolved.set(spec.id, resolveDefaultGeometry(spec.defaultGeometry, this.desktop, resolved));
        }

        // 2) 逐个建窗口.
        for (const spec of this.config.windows) {
            const content = this.content(spec.id);
            const frame = createWindowFrame({
                id: spec.id,
                title: spec.title,
                slots: content.slots ?? {},
                controls: this._actionButtons(spec.id),
                geometry: resolved.get(spec.id)!,
            });

            // 正文节点原样搬进库建的 .window-body:节点身份不变,消费者的监听/
            // 引用都还有效(旧写法搬的是 index.html 里的宿主,见 D1).
            const bodyNodes = childNodes(content.body ?? [], this.layer.ownerDocument);
            frame.body.append(...bodyNodes);
            this.layer.append(frame.element);

            this.z += 1;
            const entry: Entry = {
                spec,
                frame,
                content: bodyNodes,
                geometry: resolved.get(spec.id)!,
                restore: null,
                state: 'normal',
                gesture: new AbortController(),
                // 初始 z 按清单顺序递增:没有焦点时"可见窗口中 z 最高者"才有确定含义.
                zIndex: this.z,
            };
            this.entries.set(spec.id, entry);
            // 默认几何也要过一遍夹取:`resolveDefaultGeometry` 只做锚点换算,
            // 小视口下它的结果可以低于 `minSize`(`view` 在 1280x700 上是 159 <
            // 180),`objects` 的 `y` 甚至可能为负(标题栏被顶出桌顶,再也抓不回来).
            // 与 `setGeometry` / `restoreAll` / `onDesktopResize` 共用 `fitGeometry`,
            // 初始态不再是唯一例外.
            entry.geometry = fitGeometry(entry.geometry, this._limits(entry));
            // 初始 z 也要落到 DOM 上:层叠顺序不能靠 DOM 顺序(窗口层是个
            // 独立的层,z-index: auto 的窗口会被显式取号的窗口压住).
            frame.element.style.zIndex = String(entry.zIndex);

            this._bindWindowMove(entry);
            this._bindWindowRaise(entry);
            for (const handle of frame.handles) {
                bindWindowResize(handle.element, entry.gesture.signal, handle.direction,
                    (next) => this.setGeometry(spec.id, next),
                    { geometry: () => entry.geometry, state: () => entry.state });
            }

            this._applyGeometry(spec.id);
            this._applyState(spec.id);
        }

        // 3) Dock:它的监听与 window.resize 一起挂在 this.abort 上.
        this.snapPreview = createSnapPreview(this.snapElement);
        this.dock = createDock(this.dockElement, this.config.windows, {
            onSelect: (id) => this._onDockSelect(id),
            onRestoreAll: () => this.restoreAll(),
        });

        // 0) 桌面尺寸变化:重新夹取(旧稿漏了这条).监听挂在窗口层所属的
        // document 对应的 window 上(D7),库不读全局 window.
        this.layer.ownerDocument.defaultView?.addEventListener(
            'resize',
            this.onDesktopResize,
            { signal: this.abort.signal },
        );

        // 4) 初始焦点必须有一个,否则 z 序没有参照.
        const first = this.config.windows[0]?.id;
        if (first) this.focus(first, { takeDomFocus: false });
    }

    /**
     * 抬升并聚焦:唯一入口(§3.2).
     *
     * **指针路径默认不夺 DOM 焦点**:点在编辑器里光标不能丢,点在参数输入框里
     * 焦点不能被窗口抢走.只有程序路径(`reveal()` / Dock 点击)才传
     * `takeDomFocus: true`.
     */
    focus(id: WindowId, options: { takeDomFocus?: boolean } = {}): void {
        const entry = this.entries.get(id);
        if (!entry || this._hidden(entry)) return;

        this.focusedId = id;
        // 从 110 起递增,不做取模回收:会话内几百次提升不会溢出,回收只会引入
        // "层级回绕"的隐蔽 bug.
        this.z += 1;
        entry.zIndex = this.z;
        // z-index 只在这里写(几何写入不碰它).
        entry.frame.element.style.zIndex = String(entry.zIndex);

        for (const other of this.entries.values()) {
            other.frame.element.classList.toggle('is-focused', other.spec.id === id);
        }
        this.dock?.setActive(id);

        if (options.takeDomFocus === true) {
            // `preventScroll`:聚焦不该把窗口正文滚一下.
            entry.frame.element.focus({ preventScroll: true });
        }
    }

    /** 恢复可见 + 抬升聚焦(点条目末尾的"过程",Dock 点击都走这里). */
    reveal(id: WindowId): void {
        const entry = this.entries.get(id);
        if (!entry) return;
        if (this._hidden(entry)) {
            entry.state = 'normal';
            this._applyState(id);
            this._applyGeometry(id);
        }
        this.focus(id, { takeDomFocus: true });
    }

    getState(id: WindowId): WindowState {
        const entry = this.entries.get(id);
        if (!entry) throw new Error(`WindowManager: 未登记的窗口 ${id}`);
        return entry.state;
    }

    getGeometry(id: WindowId): Geometry {
        const entry = this.entries.get(id);
        if (!entry) throw new Error(`WindowManager: 未登记的窗口 ${id}`);
        return entry.geometry;
    }

    /** 几何落地后的回调(编辑器行号/高亮层要跟着重排).返回退订函数. */
    onGeometryChange(listener: (id: WindowId) => void): () => void {
        this.geometryListeners.add(listener);
        return () => this.geometryListeners.delete(listener);
    }

    setMinimized(id: WindowId, minimized: boolean): void {
        const entry = this._require(id);
        if (minimized) {
            if (this._hidden(entry)) return;
            entry.state = 'minimized';
            this._applyState(id);
            this._applyGeometry(id);
            this._refocusAfterHide(id);
        } else {
            if (entry.state !== 'minimized') return;
            entry.state = 'normal';
            this._applyState(id);
            this._applyGeometry(id);
            this.focus(id, { takeDomFocus: true });
        }
    }

    setMaximized(id: WindowId, maximized: boolean): void {
        const entry = this._require(id);
        if (maximized) {
            if (entry.state === 'maximized') return;
            // 无条件记下当前几何:用 `??=` 会把上一次最大化前的旧值留到下一次
            // (用户中途挪过的位置在还原时被丢掉,见 WindowManager.test.ts 的
            // "最大化/还原走两轮"用例).
            entry.restore = entry.geometry;
            entry.state = 'maximized';
        } else {
            if (entry.state !== 'maximized') return;
            entry.geometry = entry.restore ?? entry.geometry;
            // 还原后立刻清掉:留着它下一次最大化就不会再记录新位置.
            entry.restore = null;
            entry.state = 'normal';
        }
        // 先落地状态类,再按新状态决定"写四条行内属性"还是"清掉它们".
        this._applyState(id);
        this._applyGeometry(id);
    }

    /** 把五个窗口复位到默认几何(对应参考项目的"恢复默认"). */
    restoreAll(): void {
        const resolved = new Map<WindowId, Geometry>();
        for (const spec of this.config.windows) {
            resolved.set(spec.id, resolveDefaultGeometry(spec.defaultGeometry, this.desktop, resolved));
        }
        for (const entry of this.entries.values()) {
            entry.state = 'normal';
            entry.restore = null;
            // 复位也收回桌内:小视口下"默认几何"可能本来就越界.
            entry.geometry = fitGeometry(resolved.get(entry.spec.id)!, this._limits(entry));
            this._applyState(entry.spec.id);
            this._applyGeometry(entry.spec.id);
        }
        const first = this.config.windows[0]?.id;
        if (first) this.focus(first, { takeDomFocus: false });
    }

    /** 几何的唯一入口:过一遍夹取,再交给 `_applyGeometry`. */
    setGeometry(id: WindowId, next: Geometry): void {
        const entry = this._require(id);
        entry.geometry = clampGeometry(next, this._limits(entry));
        this._applyGeometry(id);
    }

    /** 桌面尺寸变化的公开入口(`bind()` 已挂到 `window.resize`;测试也用它). */
    onDesktopResize = (): void => {
        if (!this.root) return;
        this.desktop = this._measureDesktop();
        for (const entry of this.entries.values()) {
            // 隐藏态(最小化)也要收:它保留的是普通态几何,而恢复路径不做夹取
            // --桌面变小期间停在桌外的窗口恢复后就再也抓不回来了.
            if (entry.state !== 'maximized') {
                // resize 是外部变化:把窗口整体收回桌内(拖动仍按 §3.4 的夹取).
                entry.geometry = fitGeometry(entry.geometry, this._limits(entry));
            }
            // maximized 的几何由 CSS 类接管,这里只需重刷状态类.
            this._applyState(entry.spec.id);
            this._applyGeometry(entry.spec.id);
        }
    };

    /**
     * 解绑:摘掉监听,把正文节点**还回桌面根**,再丢状态.
     *
     * 正文节点必须在删窗口之前还回去:它们由消费者建(`#dsl-editor` 这类没有
     * 第二份备份),留在已删除的外壳里就等于丢了 DOM(与 `PanelController.dispose()`
     * "先把 DOM 复位再丢状态"同一条约定).还回的是**消费者给的节点本身**,
     * 不是库建的 `.window-body` 容器.
     */
    dispose(): void {
        this.abort.abort();
        this.snapPreview?.dispose();
        this.snapPreview = null;
        this.dock?.dispose();
        this.dock = null;

        for (const entry of this.entries.values()) {
            entry.gesture.abort();
            if (this.root) this.root.append(...entry.content);
            entry.frame.dispose();
        }
        this.entries.clear();
        this.geometryListeners.clear();
        this.pendingSnap = null;
        this.focusedId = null;
        this.lastTitleDown.clear();
        // 行内变量是这次挂载写上去的,跟着一起撤:同一个 root 再挂一个桌面时
        // 不该继承上一个实例的尺寸.
        this.root?.style.removeProperty('--dock-reserve');
        this.root?.style.removeProperty('--window-header-height');
        this.root = null;
    }

    // ---------------------------------------------------------------- 内部

    private _require(id: WindowId): Entry {
        const entry = this.entries.get(id);
        if (!entry) throw new Error(`WindowManager: 未登记的窗口 ${id}`);
        return entry;
    }

    private _hidden(entry: Entry): boolean {
        return entry.state === 'minimized';
    }

    /**
     * 把两个"CSS 必须自己读"的尺寸从 config 写到桌面根的 CSS 变量上.
     *
     * 为什么由库写、而不是让消费者在主题里再传一遍:`dockReserve` 与
     * `headerHeight` 各自有**两个**消费者--JS 几何(工作区上沿、正文高度换算)
     * 与 CSS(`.dock` 高度、`.window.is-maximized` 的 `inset`、`.window-header`
     * 高度).两处各留一份数就一定会漂:改了一处,窗口要么盖住任务栏,要么在
     * 任务栏下留一条缝.写在这里之后,`DesktopConfig` 是运行期唯一来源,
     * `styles/tokens.css` 里那份只是"没有 JS 时的兜底值".
     *
     * 写成 root 的行内变量:`.dock` / `.window` / `.window-layer` 都是它的后代,
     * 变量沿继承树下发,同时压过 `:root` 上的主题值.
     */
    private _writeShellVars(root: HTMLElement): void {
        root.style.setProperty('--dock-reserve', `${this.config.dockReserve}px`);
        root.style.setProperty('--window-header-height', `${this.config.headerHeight}px`);
    }

    private _measureDesktop(): Desktop {
        const root = this.root;
        return {
            w: root ? root.clientWidth : 0,
            h: root ? root.clientHeight : 0,
            dockReserve: this.config.dockReserve,
            edgeGap: this.config.edgeGap,
        };
    }

    private _limits(entry: Entry): Limits {
        return {
            desktop: this.desktop,
            min: entry.spec.minSize,
            edgeKeep: this.config.edgeKeep,
            headerMinVisible: this.config.headerMinVisible,
        };
    }

    private _actionButtons(id: WindowId): WindowActionButton[] {
        return this.config.actions.map((action) => ({
            id: action.id,
            text: action.text,
            onClick: () => this._runWindowAction(id, action.id),
        }));
    }

    private _runWindowAction(id: WindowId, action: string): void {
        switch (action) {
            case 'minimize': this.setMinimized(id, true); break;
            case 'maximize': this.setMaximized(id, this.getState(id) !== 'maximized'); break;
            default: break;
        }
    }

    /** Dock 点击按状态分派(§3.6). */
    private _onDockSelect(id: WindowId): void {
        const entry = this._require(id);
        if (this._hidden(entry)) {
            this.reveal(id);
            return;
        }
        if (entry.state === 'maximized') {
            this.setMaximized(id, false);
            this.focus(id, { takeDomFocus: true });
            return;
        }
        if (this.focusedId === id) {
            this.setMinimized(id, true);
            return;
        }
        this.focus(id, { takeDomFocus: true });
    }

    /** 最小化当前焦点窗口后,焦点交给可见窗口中 z 最高的那个. */
    private _refocusAfterHide(hiddenId: WindowId): void {        let best: Entry | null = null;
        for (const entry of this.entries.values()) {
            if (entry.spec.id === hiddenId || this._hidden(entry)) continue;
            if (!best || entry.zIndex > best.zIndex) best = entry;
        }
        this.focusedId = best ? best.spec.id : null;
        for (const entry of this.entries.values()) {
            entry.frame.element.classList.toggle(
                'is-focused',
                best !== null && entry.spec.id === best.spec.id,
            );
        }
        this.dock?.setActive(this.focusedId);
    }

    /**
     * `.window-title` 上的拖动:增量语义,夹取由 `setGeometry` 统一做一次.
     *
     * 拖动期间另记一份**没有被磁吸修正过**的位置(`unsnapped`),增量只累加在它
     * 上面.磁吸是"这一次移动"的显示修正,不能成为下一次增量的基准:真机上
     * 每个 `pointermove` 只有几个像素,拿被吸住的位置当基准,每一次增量都会
     * 重新落回阈值内、被再吸一次,窗口就**再也离不开**那条共用的边(两个窗口
     * 都在 `x: { at: 16 }` 的示例里,表现就是"只能上下动").见
     * docs/windowing-plan.md §3.5:"下一次移动会先清掉修正再判".
     */
    private _bindWindowMove(entry: Entry): void {
        const id = entry.spec.id;
        /**
         * 这次按下是否还欠一次"从最大化还原".
         *
         * 刻意**不在 pointerdown 上还原**:单纯点一下标题栏(而不是拖)不该把
         * 最大化窗口还原掉;等第一次真的移动了再还原并跟手.双击序列里夹着的
         * 那些按下因此完全无害.
         */
        let pendingRestore = false;
        /** 本次拖动里未被磁吸修正的位置;`null` = 还没开始累加. */
        let unsnapped: Geometry | null = null;
        bindDragGesture(entry.frame.title, entry.gesture.signal, {
            canStart: (event) => {
                if (this._hidden(entry)) return false;
                // 双击标题栏 = 最大化 / 还原(与标题栏按钮同一条写入路径).
                if (this._isTitleDoubleClick(id, event)) {
                    this._toggleTitleDoubleClick(entry);
                    return false;
                }
                return true;
            },
            onStart: () => {
                pendingRestore = entry.state === 'maximized';
                unsnapped = null;
                entry.frame.element.classList.add('is-dragging');
                this.focus(id);
            },
            onDelta: (dx, dy, event) => {
                // 最大化下拖标题栏 = 第一次移动时还原,再跟手.
                if (pendingRestore) {
                    pendingRestore = false;
                    this.setMaximized(id, false);
                }
                const moved = moveGeometry(
                    unsnapped ?? entry.geometry,
                    dx,
                    dy,
                    this._limits(entry),
                );
                unsnapped = moved;
                // 磁吸只改这一次落地的结果,不参与上面的累加(否则就是死区).
                const next = magnetize(moved, this._otherGeometries(id), this.config.snap.magnet);

                const snap = resolveEdgeSnap(
                    { x: event.clientX, y: event.clientY },
                    this.desktop,
                    this.config.snap,
                );
                this.pendingSnap = snap ? { id, kind: snap.kind, target: snap.target } : null;
                if (snap) this.snapPreview?.show(snap.target);
                else this.snapPreview?.hide();

                this.setGeometry(id, next);
            },
            onEnd: () => {
                unsnapped = null;
                entry.frame.element.classList.remove('is-dragging');
                this.snapPreview?.hide();
                const snap = this.pendingSnap;
                this.pendingSnap = null;
                if (!snap || snap.id !== id) return;
                // 预览与落地调的是同一个纯函数算出来的几何.
                if (snap.kind === 'maximize') this.setMaximized(id, true);
                else this.setGeometry(id, snap.target);
            },
        });
    }

    /**
     * 窗口上任意位置的 `pointerdown`(捕获阶段)提升焦点.
     *
     * 只调 `focus(id)`(默认不夺 DOM 焦点),不 `preventDefault`,不
     * `stopPropagation`:正文输入框与 `bindDragGesture` 都要照常收到事件.
     */
    private _bindWindowRaise(entry: Entry): void {
        entry.frame.element.addEventListener('pointerdown', () => {
            this.focus(entry.spec.id);
        }, { capture: true, signal: entry.gesture.signal });
    }

    /** 两次标题栏按下的间隔在阈值内算双击(第一次按下只记时间,不影响拖动). */
    private _isTitleDoubleClick(id: WindowId, event: PointerEvent): boolean {
        const stamp = event.timeStamp;
        const last = this.lastTitleDown.get(id);
        // 冷却期把 last 记到"未来",所以这里必须卡住下界:否则下一次按下的差值为负,
        // 反而正好落进 <= 阈值里,三击的中间那一下会被当成双击.
        if (last !== undefined && stamp - last >= 0 && stamp - last <= DOUBLE_CLICK_MS) {
            // 双击之后冷却一拍:否则"三击"的第三下又会被算成一次双击,而中间
            // 那一下还可能触发"拖最大化窗口 = 还原",观感是窗口一闪一闪.
            this.lastTitleDown.set(id, stamp + DOUBLE_CLICK_MS + 1);
            return true;
        }
        this.lastTitleDown.set(id, stamp);
        return false;
    }

    private _toggleTitleDoubleClick(entry: Entry): void {
        const id = entry.spec.id;
        if (entry.state === 'maximized') this.setMaximized(id, false);
        else if (entry.state === 'normal') this.setMaximized(id, true);
        this.focus(id);
    }

    private _otherGeometries(id: WindowId): Geometry[] {
        const others: Geometry[] = [];
        for (const entry of this.entries.values()) {
            if (entry.spec.id === id || this._hidden(entry)) continue;
            others.push(entry.geometry);
        }
        return others;
    }

    /**
     * 几何的唯一写入点.
     *
     * 最大化的几何由 `.is-maximized` 的 `inset` 负责,这里必须**先清掉四条行内
     * 几何**:行内 `left/top/width/height` 会压过类规则,不清就是"点了最大化
     * 没反应"(见 §11.2 E9).
     */
    private _applyGeometry(id: WindowId): void {
        const entry = this._require(id);
        if (entry.state === 'maximized') {
            clearGeometry(entry.frame.element);
        } else {
            // 隐藏态也照常写几何:隐藏用 opacity + inert,尺寸必须仍然有效,
            // 否则编辑器行号与高亮层会量到 0(见 §5.6).
            writeGeometry(entry.frame.element, entry.geometry);
        }
        // 正文高度写成 CSS 变量:示例浮层的 `max-height` 要按**所属窗口正文**算,
        // 而它在标题栏里,百分比解析不到窗口高度(见 §11.2 E5).这是给 CSS 的派生量,
        // 不是几何副本:四条几何属性仍然只有 writeGeometry 一个来源.
        entry.frame.element.style.setProperty(
            '--window-body-height',
            `${this._effectiveHeight(entry) - this.config.headerHeight}px`,
        );
        for (const listener of this.geometryListeners) listener(id);
    }

    /**
     * 窗口在屏幕上实际占的高度(最大化由 CSS 类决定,不看 `geometry`).
     * 最大化铺的是工作区(`h - dockReserve`,从顶部任务栏下沿到底边).
     */
    private _effectiveHeight(entry: Entry): number {
        if (entry.state === 'maximized') return this.desktop.h - this.config.dockReserve;
        return entry.geometry.h;
    }

    /** 状态的唯一写入点:`.window` 上的每一个类都在这里切. */
    private _applyState(id: WindowId): void {
        const entry = this._require(id);
        const element = entry.frame.element;
        const hidden = this._hidden(entry);

        element.classList.toggle('is-maximized', entry.state === 'maximized');
        // 隐藏态只有一个(is-minimized 的实现):用 opacity + inert,不用
        // display:none--编辑器行号与高亮层会量到 0 尺寸(见 §5.6).
        element.classList.toggle('is-hidden', hidden);
        element.toggleAttribute('inert', hidden);
        element.setAttribute('aria-hidden', String(hidden));

        // 窗口按钮的文案不做状态切换:actions 是**静态**配置,按钮一直显示自己
        // 那一个词(`min` / `max`);"已最大化"由窗口本身的尺寸与
        // `.is-maximized` 类表达.

        const button = this.dock?.buttons.get(id);
        button?.setState(entry.state);
        button?.setActive(this.focusedId === id);
    }
}
