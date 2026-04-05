def build_html_document(inner_html: str) -> str:
    safe = inner_html
    inner = safe.strip() or "<p>(Пусто)</p>"
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <style>
    body {{
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.35;
      margin: 2cm;
      color: #111;
    }}
    h1 {{ font-size: 16pt; text-align: center; }}
    h2 {{ font-size: 14pt; margin-top: 1em; }}
    h3 {{ font-size: 12pt; margin-top: 0.8em; }}
    p {{ margin: 0.35em 0; text-align: justify; }}
    ul {{ margin: 0.35em 0; padding-left: 1.4em; }}
  </style>
</head>
<body>
{inner}
</body>
</html>"""


def html_to_pdf_bytes(html_fragment: str) -> bytes:
    from playwright.sync_api import sync_playwright

    full_html = build_html_document(html_fragment)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.set_content(full_html, wait_until="networkidle")
            pdf = page.pdf(
                format="A4",
                margin={"top": "20mm", "bottom": "20mm", "left": "20mm", "right": "20mm"},
            )
        finally:
            browser.close()
    return pdf
