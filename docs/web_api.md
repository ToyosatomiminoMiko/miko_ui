# web api 简要原理

## 基本概念

文档对象模型(DOM)

```text
window
 └─ document       <- 文档
     ├─ doctype    <- `<!DOCTYPE html>`
     ├─ html       <- 根元素
     ... (各种方法)
```

## 手写创建元素

- 创建元素:

input:

```js
document.createElement('div')
```

output:

```js
<div></div>
```

- 创建文本节点:

input:

```js
document.createTextNode('abcd');
```

output:

```js
"abcd"
```

- 创建属性:

input:

```js
var a = document.createAttribute('class');
```

output:

```js
undefined
```

input:

```js
a.value="abc";
```

output:

```js
'abc'
```

input:

```js
a
```

output:

```js
class='abc'
```

## `Node`子类型/实现

`nodeType` 是 DOM 中所有节点都有的一个**只读数字属性**,定义在 `Node` 接口上.它用来表示"这个节点是什么类型".

| value | 常量 | 含义 |
| --- | --- | --- |
| 1 | `Node.ELEMENT_NODE` | 元素节点 (`<div>`) |
| 2 | `Node.ATTRIBUTE_NODE` | 属性节点 (`class="a"`) |
| 3 | `Node.TEXT_NODE` | 文本节点 |
| 4 | `Node.CDATA_SECTION_NODE` | CDATA 区段 |
| 7 | `Node.PROCESSING_INSTRUCTION_NODE` | 处理指令 |
| 8 | `Node.COMMENT_NODE` | 注释节点 |
| 9 | `Node.DOCUMENT_NODE` | 整个文档,即 `Document` |
| 10 | `Node.DOCUMENT_TYPE_NODE` | 文档类型 (`<!DOCTYPE html>`) |
| 11 | `Node.DOCUMENT_FRAGMENT_NODE` | 文档片段, `ShadowRoot` 也属于这类 |

任意节点获取根,不可从`<html>`自身开始

```js
$0.ownerDocument.documentElement;
```
