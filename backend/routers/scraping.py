from fastapi import APIRouter
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup
import re

router = APIRouter()

class URLInput(BaseModel):
    url: str

class SiteInfo(BaseModel):
    title: str
    icon_url: str = None

@router.post("/scrape/", response_model=SiteInfo)
def scrape_site_info(url_input: URLInput):
    """
    URLからサイト名とアイコンを自動取得するエンドポイント
    """
    try:
        # ユーザーエージェントを設定し、ボットと認識されないようにする
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
        response = requests.get(url_input.url, headers=headers, timeout=10)
        response.raise_for_status() # 200以外なら例外を発生
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # 1. サイト名 (タイトル) を取得
        title = soup.title.string if soup.title else "タイトル不明"
        
        # 2. アイコンURLを取得
        icon_url = None
        # 複数のrel属性をチェック
        icon_link = soup.find('link', rel=re.compile(r'(icon|apple-touch-icon)', re.I))
        
        if icon_link and icon_link.get('href'):
            # 相対パスを絶対パスに変換 (例: /favicon.ico -> http://example.com/favicon.ico)
            icon_url = requests.utils.urljoin(url_input.url, icon_link['href'])
            
        # 取得できなかった場合は、よくあるパスを試すなどしても良いが、今回はシンプルに返す
            
        return SiteInfo(title=title, icon_url=icon_url)
        
    except requests.exceptions.RequestException as e:
        # 接続エラーやタイムアウトの場合
        return SiteInfo(title=f"取得失敗: {e}", icon_url=None)
    except Exception as e:
        # その他のエラー
        return SiteInfo(title=f"処理エラー: {e}", icon_url=None)