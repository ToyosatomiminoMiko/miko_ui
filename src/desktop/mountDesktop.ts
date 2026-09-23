/**
 * `mountDesktop` -- 库自己建桌面三层与全部窗口外壳(D1).
 *
 * 旧写法是**反过来**的:`index.html` 手写二十多个带 id 的宿主(窗口层,Dock,
 * 吸附层,以及五个窗口的正文容器),`app/appHosts.ts` 再按 id 逐个取出来交给
 * `WindowManager`.那样库要求消费者先写一份"宿主清单",漏一个就到运行期才炸;
 * 同页两个实例更是直接串味(第二份 id 重复).
 *
 * 现在反过来:消费者只给一个**空容器**与一张声明表 -- 每个窗口装什么内容由
 * `content()` 现建或事先建好交给库,库负责建容器并把节点搬进去.于是
 * `index.html` 缩到 `<div id="app">`.
 *
 * 库**不猜**"消费者有哪些窗口":窗口清单,标题全部是构造参数(见
 * `desktop/types.ts`).库默认值 `DEFAULT_DESKTOP_CONFIG` 里**没有窗口**,
 * 只 Default 每个桌面都成立的量(动作 / 余量 / z / 吸附).
 */
import { childNodes, create_element, type Child } from '../widgets/dom';
import { WindowManager, type WindowContentSpec } from './WindowManager';
import type { DesktopConfig, WindowId } from './types';

/** `mountDesktop()` 的全部输入:桌面配置 + 逐窗口内容 + 桌面背景. */
export interface DesktopSpec extends DesktopConfig {
    /**
     * 逐窗口内容:库按 id 现取一次,拿到标题栏槽位节点与正文节点.节点归消费者
     * 所有,库只负责把它们搬进对应槽位 / 正文.
     *
     * 放在 spec 上而不是塞进每个窗口条目:窗口清单保持纯数据(与 `DesktopConfig`
     * 同一形状,可以直接用应用侧的配置),内容装配是另一件事.
     */
    readonly content?: (id: WindowId) => WindowContentSpec;
    /**
     * 窗口层**之下**的桌面内容(应用侧是 3D 视口).
     *
     * 直接 append 到 root,不额外套一层:应用现有 CSS 就是按"`#viewport` 是
     * `#app` 的直接子节点"写的,多包一层会改变选择器与堆叠上下文.
     */
    readonly background?: readonly Child[];
}

/** `mountDesktop()` 的返回值:三层容器,窗口管理器与一次性的拆卸入口. */
export interface DesktopHandle {
    readonly root: HTMLElement;
    readonly windowLayer: HTMLElement;
    readonly snapPreview: HTMLElement;
    readonly dock: HTMLElement;
    /** 窗口状态机(z-order/几何/Dock 都归它). */
    readonly windows: WindowManager;
    /** 拆掉窗口与三层容器;消费者给的正文节点被还回 root,不随外壳一起丢. */
    dispose(): void;
}

/**
 * 在 `root` 里立起一个桌面.
 *
 * 三层容器用**类名**(.window-layer / .snap-preview / .dock):库的样式表里没有
 * id 选择器,也就不要求消费者写任何宿主(D8).id 只用于"标签关联",不作为
 * 库与消费者之间的契约.
 * 
 * @param root: id挂载点
 */
export function mountDesktop(root: HTMLElement, spec: DesktopSpec): DesktopHandle {
    const doc = root.ownerDocument;

    // 背景先落:保持"视口 -> 窗口层 -> 吸附预览 -> Dock"与旧 index.html 同构
    // (层叠顺序由配置里的 z-index 决定,这里只是让人读起来是同一个结构).
    root.append(...childNodes(spec.background ?? [], doc));

    const windowLayer = create_element('div', { class: 'window-layer', root: doc });
    const snapPreview = create_element('div', {
        class: 'snap-preview',
        'aria-hidden': 'true',
        root: doc,
    });
    const dock = create_element('div', {
        class: 'dock',
        role: 'toolbar',
        'aria-label': '窗口',
        root: doc,
    });
    root.append(windowLayer, snapPreview, dock);

    // 内容按窗口 id 现取:窗口清单就是构造参数,不依赖 DOM 里有宿主.
    const content: (id: WindowId) => WindowContentSpec = spec.content ?? (() => ({}));

    const windows = new WindowManager(spec, windowLayer, dock, snapPreview, content);
    windows.bind();

    return {
        root,
        windowLayer,
        snapPreview,
        dock,
        windows,
        dispose(): void {
            // 先让 WindowManager 把正文节点还回 root,再删三层容器.
            windows.dispose();
            windowLayer.remove();
            snapPreview.remove();
            dock.remove();
        },
    };
}
