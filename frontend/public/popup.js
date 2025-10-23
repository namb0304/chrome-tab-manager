const API_URL = 'http://localhost:8000';
const DASHBOARD_URL = 'http://localhost:5173'; // ⭐ 追加

let accessToken = null;

// 初期化処理
async function init() {
    const messageDiv = document.getElementById('message');
    
    // chrome.storage からトークンを取得
    chrome.storage.local.get(['accessToken'], async (result) => {
        accessToken = result.accessToken;
        
        if (!accessToken) {
            // トークンがない場合、ログインを促す
            messageDiv.innerHTML = '<p class="error">ログインが必要です。ダッシュボードを開いてログインしてください。</p>';
            document.getElementById('addButton').disabled = true;
            return;
        }
        
        // カテゴリを読み込む
        await loadCategories();
        
        // 現在のタブ情報を取得
        await loadCurrentTab();
    });
}

// カテゴリ一覧を取得
async function loadCategories() {
    const categorySelect = document.getElementById('category');
    const messageDiv = document.getElementById('message');
    
    try {
        const response = await fetch(`${API_URL}/api/categories`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('カテゴリの取得に失敗しました');
        }
        
        const categories = await response.json();
        
        categorySelect.innerHTML = '<option value="">カテゴリを選択</option>';
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = cat.name;
            categorySelect.appendChild(option);
        });
        
    } catch (error) {
        console.error('カテゴリ取得エラー:', error);
        messageDiv.innerHTML = '<p class="error">カテゴリの読み込みに失敗しました。</p>';
    }
}

// 現在のタブ情報を取得
async function loadCurrentTab() {
    const titleInput = document.getElementById('title');
    const urlInput = document.getElementById('url');
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            titleInput.value = tabs[0].title || '';
            urlInput.value = tabs[0].url || '';
        }
    });
}

// サイトを追加
async function addSite() {
    const title = document.getElementById('title').value.trim();
    const url = document.getElementById('url').value.trim();
    const categoryId = document.getElementById('category').value;
    const messageDiv = document.getElementById('message');
    
    if (!url || !categoryId) {
        messageDiv.innerHTML = '<p class="error">URLとカテゴリを選択してください。</p>';
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/sites`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify({
                title: title || url,
                url: url,
                category_id: parseInt(categoryId)
            })
        });
        
        if (!response.ok) {
            throw new Error('サイトの追加に失敗しました');
        }
        
        messageDiv.innerHTML = '<p class="success">✅ サイトを追加しました！</p>';
        
        // 2秒後にポップアップを閉じる
        setTimeout(() => {
            window.close();
        }, 2000);
        
    } catch (error) {
        console.error('サイト追加エラー:', error);
        messageDiv.innerHTML = '<p class="error">サイトの追加に失敗しました。</p>';
    }
}

// ⭐⭐ 修正: ダッシュボードを開く処理（明示的にURLを指定）
function openDashboard() {
    // chrome.tabs.create だと相対パスとして解釈される可能性があるため、
    // 明示的に完全なURLを指定する
    chrome.tabs.create({ 
        url: 'http://localhost:5173',
        active: true 
    });
}

// イベントリスナー
document.getElementById('addButton').addEventListener('click', addSite);
document.getElementById('dashboardButton').addEventListener('click', openDashboard);

// 初期化実行
init();