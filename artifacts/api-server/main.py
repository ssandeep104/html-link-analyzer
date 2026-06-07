import os
import base64
import requests as http_requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from parser import parse_html, extract_webarchive_html

app = FastAPI(title="HTML Link Parser API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


class ParseUrlRequest(BaseModel):
    url: str


class ParseFileRequest(BaseModel):
    html_content: Optional[str] = None
    file_content_b64: Optional[str] = None
    filename: Optional[str] = None
    base_url: Optional[str] = None


@app.get("/api/healthz")
def health_check():
    return {"status": "ok"}


@app.post("/api/parse/url")
def parse_url(body: ParseUrlRequest):
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    try:
        response = http_requests.get(url, headers=BROWSER_HEADERS, timeout=15, allow_redirects=True)
        response.raise_for_status()
        html_content = response.text
        final_url = response.url
    except http_requests.exceptions.Timeout:
        raise HTTPException(status_code=422, detail="Request timed out fetching the URL")
    except http_requests.exceptions.ConnectionError:
        raise HTTPException(status_code=422, detail="Could not connect to the URL")
    except http_requests.exceptions.HTTPError as e:
        raise HTTPException(status_code=422, detail=f"HTTP error fetching URL: {e}")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Failed to fetch URL: {str(e)}")

    result = parse_html(html_content, final_url)
    return {
        "source": final_url,
        "base_url": final_url,
        **result,
    }


@app.post("/api/parse/file")
def parse_file(body: ParseFileRequest):
    filename = body.filename or "uploaded-file.html"
    is_webarchive = filename.lower().endswith(".webarchive")

    if is_webarchive:
        if not body.file_content_b64:
            raise HTTPException(status_code=400, detail="file_content_b64 is required for .webarchive files")
        try:
            raw_bytes = base64.b64decode(body.file_content_b64)
        except Exception:
            raise HTTPException(status_code=400, detail="file_content_b64 is not valid base64")
        try:
            html_content, detected_url = extract_webarchive_html(raw_bytes)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        base_url = body.base_url or detected_url or ""
    else:
        if not body.html_content or not body.html_content.strip():
            raise HTTPException(status_code=400, detail="html_content is required for HTML files")
        html_content = body.html_content
        base_url = body.base_url or ""

    result = parse_html(html_content, base_url)
    return {
        "source": filename,
        "base_url": base_url,
        **result,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
