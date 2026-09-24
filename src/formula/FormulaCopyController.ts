/**
 * 公式复制控制器.
 *
 * 公式是 KaTeX 排版出来的展示元素,本身不可选中.这里做一层事件委托:
 * 点/键盘激活任意一个带 `data-tex` 的公式,就把它的原始 TeX 写进剪贴板.
 *
 * 为什么用委托而不是逐个绑定:
 * 公式 DOM 由消费者在每次 sync 时整体重建(内部走 createFormulaElement 的
 * 模板 clone),逐个绑定会在重建后失效.
 *
 * 为什么提示是一组节点而不是一个:
 * "可复制"的文案由调用方传入的提示元素承担,复制成功/失败改这些元素回显;公式
 * 本身只用 cursor / focus 样式表达可操作,不在每行挂 tooltip,避免列表被提示
 * 文字淹没.但**提示可以不止一处**:同一个列表被拆成两个窗口(或同一屏上有两处
 * 可复制公式的列表)时,每处标题栏都该有这句提示.所以构造参数收一个**数组**,
 * 一次回显写全部节点 -- 它们表达的是同一个状态,不该各说各话.
 *
 * 键盘入口:可复制公式由 FormulaView 加了 `tabindex="0"` 与 `role="button"`,
 * 所以除鼠标外还有一条键盘路径.
 *
 * 键盘监听不在这里绑:KeyboardController 对 document 统一绑一次 keydown,
 * 本控制器用 `keyboardBinding()` 把"Enter/Space + 目标是可复制公式"这条规则
 * 注册进去,由它统一分发.
 */
import type { KeyboardBinding } from '../shared/KeyboardController';

const HINT_RESET_DELAY = 1200;

const HINT_COPIED = '已复制 TeX';
const HINT_FAILED = '复制失败';

/**
 * 写剪贴板:只有异步剪贴板一条通道.
 *
 * `navigator.clipboard` 按规范只在安全上下文暴露(https,`localhost`/`127.0.0.1`,
 * `file:`,见 Secure Contexts),非安全上下文里它直接是 undefined,取成员就抛
 * TypeError;权限被拒,文档失焦同样会 reject.这些一律归一化成 false,由调用方回显
 * 失败--不保留 `execCommand` 兜底:那条路要自造选区,而公式不是可选中文本,
 * 消费者也都跑在安全上下文里,没有需要它的场景.
 */
async function writeClipboardText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

export class FormulaCopyController {
    /** 全部提示节点:一次回显写它们全部(见文件头"为什么是一组节点"). */
    private readonly hints: readonly HTMLElement[];
    /** 提示恢复用的原文案(取第一个节点的初始文本,全部节点共用). */
    private readonly defaultHint: string;
    /** 提示节点所属的 document:计时器从它走,不读全局. */
    private readonly doc: Document;
    private abortController: AbortController | null = null;

    /**
     * @cache
     * 缓存目的:回显定时器句柄;连续点击时重置同一个 timer,而不是叠加多个.
     * 键/失效策略:无键;每次回显清旧建新,dispose 时清除.
     * 生命周期:跟随 FormulaCopyController 实例.
     */
    private resetTimer: number | null = null;

    /**
     * @param hint 提示节点:传**一个**(单处提示)或**一组**(多处提示,如列表被
     *             拆成两个窗口)都行.传数组时它们表达同一个状态,每次回显一起写,
     *             不会只更新一半.
     *
     *             至少要有一个节点,空数组会抛错 -- 没有提示节点就没有"复制成功
     *             了"的回显,把这种配置错误留在构造期比留到运行期好.
     *
     *             恢复用的原文案取**第一个**节点的初始文本,所有节点共用同一份;
     *             节点初始文案不一致时以第一个为准(它们本就该是同一句话).
     */
    constructor(hint: HTMLElement | readonly HTMLElement[]) {
        this.hints = Array.isArray(hint) ? hint : [hint as HTMLElement];
        const first = this.hints[0];
        if (!first) throw new Error('FormulaCopyController: 至少要有一个提示节点');
        this.defaultHint = first.textContent ?? '';
        this.doc = first.ownerDocument;
    }

    bind(root: HTMLElement): void {
        this.abortController?.abort();
        this.abortController = new AbortController();
        const options = { signal: this.abortController.signal };
        root.addEventListener('click', this.onClick, options);
    }

    /**
     * 键盘激活入口:Enter/Space 复制聚焦的公式.
     *
     * 只描述"哪些键 + 命中哪个元素 + 命中后做什么",监听与 preventDefault
     * 交给 KeyboardController,这样键盘事件只有一个出口.
     */
    keyboardBinding(): KeyboardBinding {
        return {
            keys: ['Enter', ' ', 'Spacebar'],
            // 公式本身可聚焦(见 FormulaView),但 KaTeX 内部节点也可能成为
            // 事件目标,所以仍然从 target 往上找.
            resolve: (event) => {
                const tex = this._texFrom(event.target);
                return tex === null ? null : () => void this._copy(tex);
            },
        };
    }

    dispose(): void {
        this.abortController?.abort();
        this.abortController = null;
        if (this.resetTimer !== null) {
            this.doc.defaultView?.clearTimeout(this.resetTimer);
            this.resetTimer = null;
        }
        this._writeHints(this.defaultHint, null);
    }

    private readonly onClick = (event: MouseEvent): void => {
        const tex = this._texFrom(event.target);
        if (tex === null) return;
        void this._copy(tex);
    };

    /** 事件目标(或祖先)里可复制公式的 TeX;找不到或为空时返回 null. */
    private _texFrom(target: EventTarget | null): string | null {
        if (!(target instanceof Element)) return null;
        const tex = target.closest<HTMLElement>('[data-tex]')?.dataset.tex;
        return tex ? tex : null;
    }

    private async _copy(tex: string): Promise<void> {
        const copied = await writeClipboardText(tex);
        this._flashHint(copied ? HINT_COPIED : HINT_FAILED, copied);
    }

    /**
     * 把回显写到**全部**提示节点上,延时后恢复原文案.
     *
     * `ok` 传 `null` 表示"回到中性":文案复原,两个状态类都摘掉.
     */
    private _flashHint(message: string, ok: boolean): void {
        if (this.resetTimer !== null) this.doc.defaultView?.clearTimeout(this.resetTimer);

        this._writeHints(message, ok);

        const timer = this.doc.defaultView?.setTimeout(() => {
            this.resetTimer = null;
            this._writeHints(this.defaultHint, null);
        }, HINT_RESET_DELAY);
        // 没有 defaultView 的环境(离屏 document)不退化为异常:提示留在原地.
        this.resetTimer = timer ?? null;
    }

    /** 一次回显/复原的唯一写入点:所有提示节点走同一段代码,不会只更新一半. */
    private _writeHints(message: string, ok: boolean | null): void {
        for (const hint of this.hints) {
            hint.textContent = message;
            hint.classList.toggle('is-copied', ok === true);
            hint.classList.toggle('is-error', ok === false);
        }
    }
}
