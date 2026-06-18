# 一级标题 epytor

## 二级标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题

## 基础内联格式

这是\*\*[粗体](https://news.sina.com.cn)\*\*，这是*斜体*，这是粗斜体，这是~~删除线~~，这是 `行内代码`。

| <br /> | <br /> | <br /> |
| :----- | :----- | :----- |
| <br /> | <br /> | <br /> |
| <br /> | <br /> | <br /> |

## 列表

### 无序列表

* 无序列表项 1

  * 嵌套 1.1

    * 嵌套 1.1.1

* 无序列表项 2

### 有序列表

1. 有序列表项 1

   1. 嵌套 1.1
   2. 嵌套 1.2
2. 有序列表项 2
3. 有序列表项 3

### 任务列表

* [ ] 地方暗室逢灯
* [ ] 阿斯蒂芬非得是
* [ ] 阿迪斯发阿迪斯发撒

## 表格

### 基本表格

| 名称 | 价格 | 数量 |
| -- | -- | -- |
| 苹果 | ¥5 | 10 |
| 香蕉 | ¥3 | 5  |
| 橙子 | ¥4 | 8  |

### 带对齐的表格

| 左对齐 | 居中 | 右对齐 |
|:-------|:----:|-------:|
| a      |  b   |      c |
| 长内容 |  短  |  中中 |

### 含空单元格的表格

|       | 列A     | 列B  |
| ----- | ----- | ----- |
| 行1   | 发345678**765432345678987654345678765432345678**76543456787654 | 发的  |
| 行2   |       | 132 |

## 代码块

### TypeScript

```typescript
interface User {
    name: string
    age: number
}

const user: User = { name: "Alice", age: 30 }
console.log(user)
```

### Python

```python
def fibonacci(n: int) -> list[int]:
    a, b = 0, 1
    result = []
    for _ in range(n):
        result.append(a)
        a, b = b, a + b
    return result

print(fibonacci(10))
```

### 无语言标注

```
无语言标注的代码块
plain text
```

### JSON

```json
{
    "name": "epytor",
    "version": "1.0.1",
    "dependencies": {
        "milkdown": "^7.21.2"
    }
}
```

## Mermaid 图表

```Mermaid
graph LR
    A[开始] --> B{判断}
    B -->|是| C[执行]
    B -->|否| D[结束]
    C --> D
```

## LaTeX 数学公式

行内公式：$E = mc^2$

行内分数：$\frac{1}{2}$

块级公式：

$$
\int\_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
$$

多行公式：

$$
\begin{aligned}
\nabla \times \vec{\mathbf{B}} - \frac{1}{c} \frac{\partial\vec{\mathbf{E}}}{\partial t} &= \frac{4\pi}{c}\vec{\mathbf{j}} \\
\nabla \cdot \vec{\mathbf{E}} &= 4\pi\rho \\
\nabla \times \vec{\mathbf{E}} + \frac{1}{c} \frac{\partial\vec{\mathbf{B}}}{\partial t} &= \vec{\mathbf{0}} \\
\nabla \cdot \vec{\mathbf{B}} &= 0
\end{aligned}
$$

## 引用

> 这是一段引用文字
> 可以有多行
>
> 2345678

> 嵌套引用
>
> > 这是内层引用
> >
> > > 这是第三层引用
>
> 回到外层

## 链接

[GitHub](https://github.com)

[带标题的链接](https://www.google.com "Google 搜索")

<https://www.example.com>

***

## 图片

![123](./images/icon.png "123 ratio:0.25")![456](./images/icon.png "456 ratio:0.58")

## 水平分隔线

上面

***

中间

***

下面

***

## HTML 内联

这是 <span style="color: red">红色文字</span> 和 <kbd>Ctrl</kbd> + <kbd>S</kbd>。

***

## 硬换行

第一行\
第二行（上面末尾有两个空格）

第三行\\

第四行（上面末尾有反斜杠）

***

## Emoji

😄 🚀 🎉 ✨ ✅ ❌ 🔥 ⭐

***

## 转义字符

\*这不是斜体\*

\`这不是代码\`

\# 这不是标题

***

## 混合场景

> **粗体引用** 包含 `代码` 和 [链接](https://example.com)。

* 列表项包含 **粗体**、*斜体*、~~删除线~~ 和 `代码`

  1. 嵌套有序列表
  2. 第二项

* 回到无序列表

