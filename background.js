// Create context menu items when extension is installed
chrome.runtime.onInstalled.addListener(() => {
    // Parent menu item
    chrome.contextMenus.create({
        id: 'saveToNotes',
        title: 'Save to Quick Notes',
        contexts: ['selection']
    });

    // Sub-menu items for each category
    const categories = [
        { id: 'sql', title: 'Save as SQL' },
        { id: 'url', title: 'Save as URL' },
        { id: 'snippet', title: 'Save as Code Snippet' },
        { id: 'command', title: 'Save as Command' },
        { id: 'other', title: 'Save as Other' }
    ];

    categories.forEach(category => {
        chrome.contextMenus.create({
            id: category.id,
            parentId: 'saveToNotes',
            title: category.title,
            contexts: ['selection']
        });
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.selectionText) {
        const note = {
            id: Date.now(),
            text: info.selectionText,
            category: info.menuItemId,
            timestamp: new Date().toISOString(),
            source: tab.url // Store the source URL
        };

        // Save to storage
        chrome.storage.local.get(['notes'], (result) => {
            const notes = result.notes || [];
            notes.unshift(note);
            chrome.storage.local.set({ notes: notes }, () => {
                // Show notification
                chrome.action.setBadgeText({ text: '✓' });
                setTimeout(() => {
                    chrome.action.setBadgeText({ text: '' });
                }, 1500);
            });
        });
    }
});
