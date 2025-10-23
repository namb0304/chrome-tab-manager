// Service Workerとして動作するスクリプト

// ⭐ 外部（localhost）からのメッセージも受信できるようにする
// 型定義がないため any でキャストして回避
(chrome.runtime as any).onMessageExternal.addListener((message: any, sender: any, sendResponse: any) => {
    console.log('📩 外部からのメッセージを受信:', message, 'from:', sender.origin);
    
    // ログイン成功時にアクセストークンを chrome.storage に保存する処理
    if (message.action === 'saveToken' && message.token) {
        chrome.storage.local.set({ accessToken: message.token }, () => {
            console.log('✅ Token saved to chrome.storage:', message.token);
            sendResponse({ success: true, message: 'Token saved' });
        });
        return true; 
    }

    // ログアウト時にトークンを削除する処理
    if (message.action === 'removeToken') {
        chrome.storage.local.remove('accessToken', () => {
            console.log('✅ Token removed from chrome.storage');
            sendResponse({ success: true, message: 'Token removed' });
        });
        return true; 
    }

    sendResponse({ success: false, message: 'Unknown action' });
    return true;
});

// 拡張機能内部（ポップアップ）からのメッセージも処理
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    
    // 現在のタブのURLとタイトルを取得する要求を処理
    if (message.action === 'getCurrentTabInfo') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const currentTab = tabs[0];
            if (currentTab && currentTab.url && currentTab.title) {
                sendResponse({ 
                    url: currentTab.url, 
                    title: currentTab.title,
                });
            } else {
                sendResponse({ error: 'Failed to get current tab information.' });
            }
        });
        return true; 
    }

    sendResponse({ success: false, message: 'Unknown action' });
});

// onInstalled の呼び出し（型定義がないため any でキャスト）
(chrome.runtime as any).onInstalled.addListener(() => {
    console.log('Tab Manager extension installed/updated.');
});