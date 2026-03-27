# Automatyczne postowanie na blog via GitHub API

## Endpoint
```
PUT https://api.github.com/repos/{owner}/{repo}/contents/src/blog/posts/{filename}.md
```

## Przykład (curl)
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/danielkotlinski/danielkotlinski.pl/contents/src/blog/posts/nowy-artykul.md \
  -d '{
    "message": "Add blog post: Nowy artykuł",
    "content": "'$(echo -n '---
title: "Tytuł artykułu"
date: 2025-03-25
featuredImage: "/img/uploads/obraz.jpg"
description: "Opis artykułu do SEO"
layout: post.njk
tags: blog
---

Treść artykułu w Markdown...' | base64)'"
  }'
```

## Przykład (Python)
```python
import requests
import base64
from datetime import datetime

GITHUB_TOKEN = "ghp_xxxxxxxxxxxx"
REPO = "danielkotlinski/danielkotlinski.pl"

def create_blog_post(title, content, featured_image=None, description=None):
    slug = title.lower().replace(" ", "-").replace("ą","a").replace("ć","c").replace("ę","e").replace("ł","l").replace("ń","n").replace("ó","o").replace("ś","s").replace("ź","z").replace("ż","z")
    date = datetime.now().strftime("%Y-%m-%d")

    frontmatter = f'''---
title: "{title}"
date: {date}
featuredImage: "{featured_image or ''}"
description: "{description or ''}"
layout: post.njk
tags: blog
---

{content}'''

    encoded = base64.b64encode(frontmatter.encode()).decode()

    response = requests.put(
        f"https://api.github.com/repos/{REPO}/contents/src/blog/posts/{slug}.md",
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept": "application/vnd.github.v3+json"
        },
        json={
            "message": f"Add blog post: {title}",
            "content": encoded
        }
    )

    return response.json()

# Użycie:
create_blog_post(
    title="Mój nowy artykuł",
    content="Treść artykułu w **Markdown**...",
    featured_image="/img/uploads/obraz.jpg",
    description="Opis do SEO"
)
```

## Przykład (Node.js)
```javascript
const https = require('https');

async function createBlogPost({ title, content, featuredImage, description }) {
  const slug = title.toLowerCase()
    .replace(/[ąćęłńóśźż]/g, c => 'acelnoszz'['ąćęłńóśźż'.indexOf(c)])
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const date = new Date().toISOString().split('T')[0];

  const markdown = `---
title: "${title}"
date: ${date}
featuredImage: "${featuredImage || ''}"
description: "${description || ''}"
layout: post.njk
tags: blog
---

${content}`;

  const encoded = Buffer.from(markdown).toString('base64');

  const response = await fetch(
    `https://api.github.com/repos/OWNER/REPO/contents/src/blog/posts/${slug}.md`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        message: `Add blog post: ${title}`,
        content: encoded,
      }),
    }
  );

  return response.json();
}
```

## Ważne
- Po pushu GitHub Actions automatycznie przebuduje stronę (~1-2 min)
- Obrazy możesz uploadować tą samą metodą do `src/img/uploads/`
- Token GitHub musi mieć uprawnienie `contents: write`
- Format daty: `YYYY-MM-DD`
- Treść artykułu w Markdown
