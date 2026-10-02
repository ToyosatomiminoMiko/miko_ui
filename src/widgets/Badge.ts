/**
 * 徽章件:`<span class="ui-badge <消费者变体类>">文案</span>`.
 *
 * 一行里"这是哪一类东西"的那颗小药丸:定宽下限 + 药丸圆角 + 小字号 + 居中,
 * 底色来自 token.它只给**基线与定位**;"哪一类是什么颜色"是消费者的语义
 * (由消费者自己的变体类给,如 `.kind-curve`).
 *
 * 基线属于库而不是消费者:这 8 条声明的值**全部**出自库的 token
 * (`--radius-pill` / `--color-badge-ink` / `--color-neutral`),消费者自己写,
 * 就是把库的 token 重拼一遍.
 *
 * 默认观感写成零优先级的 `:where(.ui-badge)`(见 `styles/widgets.css`):
 * 消费者的变体类永远盖得住它,与样式表加载顺序无关(与 `.ui-button` 同一条约定).
 *
 * 返回元素而不是句柄:徽章是**静态**件 -- 文案与类名在构造时定死,之后不更新,
 * 也没有需要 `dispose` 的监听,生命周期跟着所在的那一行.
 */
import { create_element } from './dom';

/** 基线类名:每个 `createBadge` 都带,消费者的变体类叠在它后面. */
const BASE_CLASS = 'ui-badge';

export interface BadgeOptions {
    /** 消费者的变体类(颜色 / 语义),叠在基线后面. */
    readonly class?: string;
}

/**
 * 建一颗徽章.
 *
 * @param text 徽章文案(消费者的内容,库不认识它是什么).
 * @param options.class 消费者的变体类,如 `kind-curve`.
 */
export function createBadge(text: string, options: BadgeOptions = {}): HTMLElement {
    const className = options.class ? `${BASE_CLASS} ${options.class}` : BASE_CLASS;
    return create_element({ tag: 'span' }, { class: className }, text);
}
