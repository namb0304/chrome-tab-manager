// Service Workerとして動作するスクリプト

// 1. chrome.runtime.onMessage: ポップアップ(App.tsx)からのメッセージを処理
// sender を使わないため _sender にリネームして未使用の警告を回避
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
    
    // 現在のタブのURLとタイトルを取得する要求を処理
    if (message.action === 'getCurrentTabInfo') {
        // chrome.tabs.query を実行
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

// 2. onInstalled の呼び出しを Service Worker の型でラップしてエラーを回避
// (window as any).chrome と同じ要領です
(chrome.runtime as any).onInstalled.addListener(() => {
    console.log('Tab Manager extension installed/updated.');
});