# How to add your zine

Each person has a folder waiting in `zines/`:

```
zines/member1/
zines/member2/
zines/member3/
zines/member4/
```

Pick one and tell the group which one is yours.
You only ever change files **inside your own folder**. Don't touch the main index.html.

## What goes in your folder

| File | What it is |
|---|---|
| `index.html` | Your zine. Replace the placeholder with your own page. |
| `thumb.jpg` | A wide picture of your zine (2:1, for example 1400 × 700 px). It moves on the strip on pages 4–5 and fills your own spread in the book. |

Put any images, CSS or fonts your zine uses in the same folder.

## Your caption

The name and title under your thumbnail come from your own `index.html`:

```html
<title>Your Zine Title</title>
<meta name="author" content="Your Name">
```

Change those two lines and the caption updates everywhere.

## Link back to the book

Keep this somewhere on your zine so people can get back:

```html
<a href="../../index.html#zines">Back to the book</a>
```

## Upload

Upload your folder's files to the GitHub repo. The site updates in a minute or two.

Keep the file names `index.html` and `thumb.jpg` exactly as they are.
