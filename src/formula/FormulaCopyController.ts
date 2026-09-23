/**
 * 公式复制控制器.
 *
 * 场景里的公式是 KaTeX 排版出来的展示元素,本身不可选中.这里做一层事件委托:
 * 点/键盘激活任意一个带 `data-tex` 的公式,就把它的原始 TeX 写进剪贴板.
 *
 * 为什么用委托而不是逐个绑定:
 * 公式 DOM 由两个列表在每次 sync 时整体重建(`entity/EntityItem` 与
 * `evaluation/*Item`,内部走 createFormulaElement 的模板 clone),
 * 逐个绑定会在重建后失效.
 *
 * 为什么提示只有一处:
 * "可复制"的文案只在底部"实体对象"标题旁出现,复制成功/失败也改那一处回显;
 * 公式本身只用 cursor / focus 样式表达可操作,不在每行挂 tooltip,避免列表被
 * 提示文字淹没.
 *
 * 键盘入口(见 UI-P3.6):可复制公式由 FormulaView 加了 `tabindex="0"` 与
 * `role="button"`,复制因此有条键盘路径,不再只有鼠标.
 *
 * 键盘监听不在这里绑:全应用只有 KeyboardController 对 document 绑一次
 * keydown,本控制器用 `keyboardBinding()` 把"Enter/Space + 目标是可复制公式"
 * 这条规则注册进去,由它统一分发.
 */
import type { KeyboardBinding } from '../shared/KeyboardController';

const HINT_RESET_DELAY = 1200;

const HINT_COPIED = '已复制 TeX';
const HINT_FAILED = '复制失败';

/**
 * 写剪贴板:只有异步剪贴板一条通道.
 *
 * `navigator.clipboard` 按规范只在安全上下文暴露(https、`localhost`/`127.0.0.1`、
 * `file:`,见 Secure Contexts §3.1),非安全上下文里它直接是 undefined,取成员就抛
 * TypeError;权限被拒、文档失焦同样会 reject.这些一律归一化成 false,由调用方回显
 * 失败--不保留 `execCommand` 兜底:那条路要自造选区,而公式不是可选中文本,两个
 * 消费者(应用 = localhost / GitHub Pages,全是安全上下文)也没有需要它的场景.
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
    private readonly defaultHint: string;
    /** 提示节点所属的 document(D7):计时器从它走,不读全局. */
    private readonly doc: Document;
    private abortController: AbortController | null = null;

    /**
     * @cache
     * 缓存目的:回显定时器句柄;连续点击时重置同一个 timer,而不是叠加多个.
     * 键/失效策略:无键;每次回显清旧建新,dispose 时清除.
     * 生命周期:跟随 FormulaCopyController 实例.
     */
    private resetTimer: number | null = null;

    constructor(private readonly hint: HTMLElement) {
        this.defaultHint = hint.textContent ?? '';
        this.doc = hint.ownerDocument;
    }

    bind(root: HTMLElement): void {
        this.abortController?.abort();
        this.abortController = new AbortController();
        const options = { signal: this.abortController.signal };
        root.addEventListener('click', this.onClick, options);
    }

    /**
     * 键盘激活入口(UI-P3.6):Enter/Space 复制聚焦的公式.
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
        this.hint.textContent = this.defaultHint;
        this.hint.classList.remove('is-copied', 'is-error');
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

    /** 回显写在"实体对象"标题旁的提示元素上,延时后恢复原文案. */
    private _flashHint(message: string, ok: boolean): void {
        if (this.resetTimer !== null) this.doc.defaultView?.clearTimeout(this.resetTimer);

        this.hint.textContent = message;
        this.hint.classList.toggle('is-copied', ok);
        this.hint.classList.toggle('is-error', !ok);

        const timer = this.doc.defaultView?.setTimeout(() => {
            this.resetTimer = null;
            this.hint.textContent = this.defaultHint;
            this.hint.classList.remove('is-copied', 'is-error');
        }, HINT_RESET_DELAY);
        // 没有 defaultView 的环境(离屏 document)不退化为异常:提示留在原地.
        this.resetTimer = timer ?? null;
    }
}
