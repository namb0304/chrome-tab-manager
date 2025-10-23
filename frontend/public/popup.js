const API_URL = 'http://localhost:8000';

// 現在のタブ情報を取得してフォームに設定
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
        document.getElementById('url').value = tabs[0].url;
        document.getElementById('title').value = tabs[0].title;
    }
});

// トークンを取得してカテゴリ一覧をロード
chrome.storage.local.get(['accessToken'], (result) => {
    const token = result.accessToken;
    
    if (!token) {
        showError('ログインが必要です。ダッシュボードを開いてログインしてください。');
        document.getElementById('addButton').disabled = true;
        return;
    }

    // カテゴリ一覧を取得
    fetch(`${API_URL}/api/categories`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(res => {
        if (!res.ok) throw new Error('認証エラー');
        return res.json();
    })
    .then(categories => {
        const select = document.getElementById('category');
        select.innerHTML = categories.length === 0 
            ? '<option value="">カテゴリがありません</option>'
            : categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
    })
    .catch(err => {
        console.error('カテゴリ取得エラー:', err);
        showError('カテゴリの取得に失敗しました。ダッシュボードでログインし直してください。');
    });
});

// サイト追加ボタン
document.getElementById('addButton').addEventListener('click', () => {
    const title = document.getElementById('title').value;
    const url = document.getElementById('url').value;
    const category_id = document.getElementById('category').value;

    if (!url || !category_id) {
        showError('URLとカテゴリを入力してください');
        return;
    }

    chrome.storage.local.get(['accessToken'], (result) => {
        const token = result.accessToken;
        
        fetch(`${API_URL}/api/sites`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: title || url, // タイトルが空なら URL を使う
                url: url,
                category_id: parseInt(category_id)
            })
        })
        .then(res => {
            if (!res.ok) throw new Error('追加失敗');
            return res.json();
        })
        .then(() => {
            showSuccess('✅ サイトを追加しました！');
            setTimeout(() => window.close(), 1000); // 1秒後に自動で閉じる
        })
        .catch(err => {
            console.error('サイト追加エラー:', err);
            showError('サイトの追加に失敗しました');
        });
    });
});

// ダッシュボードを開くボタン
document.getElementById('dashboardButton').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
});

function showError(message) {
    const msgEl = document.getElementById('message');
    msgEl.className = 'error';
    msgEl.textContent = message;
}

function showSuccess(message) {
    const msgEl = document.getElementById('message');
    msgEl.className = 'success';
    msgEl.textContent = message;
}