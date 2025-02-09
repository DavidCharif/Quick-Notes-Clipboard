// Default options
const defaultOptions = {
    defaultCategory: 'other',
    maxNotesDisplay: 20,
    notesOrder: 'newest',
    categoryColors: {
        sql: '#007bff',
        url: '#28a745',
        snippet: '#dc3545',
        command: '#ffc107',
        other: '#6c757d'
    },
    autoBackup: 'never',
    customCategories: []
};

// Load options when the page is opened
document.addEventListener('DOMContentLoaded', async () => {
    await loadOptions();
    setupEventListeners();
});

// Load saved options from storage
async function loadOptions() {
    try {
        const result = await chrome.storage.sync.get('options');
        const options = result.options || defaultOptions;
        
        // Set values in the form
        document.getElementById('defaultCategory').value = options.defaultCategory;
        document.getElementById('maxNotesDisplay').value = options.maxNotesDisplay;
        document.getElementById('notesOrder').value = options.notesOrder;
        document.getElementById('autoBackup').value = options.autoBackup;
        
        // Set category colors
        for (const [category, color] of Object.entries(options.categoryColors)) {
            const colorInput = document.getElementById(`${category}Color`);
            if (colorInput) {
                colorInput.value = color;
            }
        }
        
        // Load custom categories
        loadCustomCategories(options.customCategories);
    } catch (error) {
        showStatus('Error loading options: ' + error.message, false);
    }
}

// Save options to storage
async function saveOptions() {
    try {
        const options = {
            defaultCategory: document.getElementById('defaultCategory').value,
            maxNotesDisplay: parseInt(document.getElementById('maxNotesDisplay').value),
            notesOrder: document.getElementById('notesOrder').value,
            autoBackup: document.getElementById('autoBackup').value,
            categoryColors: {
                sql: document.getElementById('sqlColor').value,
                url: document.getElementById('urlColor').value,
                snippet: document.getElementById('snippetColor').value,
                command: document.getElementById('commandColor').value,
                other: document.getElementById('otherColor').value
            },
            customCategories: getCustomCategories()
        };
        
        await chrome.storage.sync.set({ options });
        showStatus('Options saved successfully!', true);
    } catch (error) {
        showStatus('Error saving options: ' + error.message, false);
    }
}

// Load custom categories into the UI
function loadCustomCategories(categories) {
    const categoryList = document.getElementById('categoryList');
    categoryList.innerHTML = '';
    
    categories.forEach(category => {
        const categoryElement = createCategoryElement(category);
        categoryList.appendChild(categoryElement);
    });
}

// Create a new category element
function createCategoryElement(category) {
    const div = document.createElement('div');
    div.className = 'category-item';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = category;
    input.placeholder = 'Category name';
    
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#000000';
    
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = () => div.remove();
    
    div.appendChild(input);
    div.appendChild(colorInput);
    div.appendChild(deleteButton);
    
    return div;
}

// Get all custom categories from the UI
function getCustomCategories() {
    const categories = [];
    const categoryItems = document.querySelectorAll('.category-item input[type="text"]');
    categoryItems.forEach(input => {
        if (input.value.trim()) {
            categories.push(input.value.trim());
        }
    });
    return categories;
}

// Export notes to a JSON file
async function exportNotes() {
    try {
        const result = await chrome.storage.local.get('notes');
        const notes = result.notes || [];
        
        const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `quick-notes-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        showStatus('Notes exported successfully!', true);
    } catch (error) {
        showStatus('Error exporting notes: ' + error.message, false);
    }
}

// Import notes from a JSON file
async function importNotes() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.onchange = async (e) => {
        try {
            const file = e.target.files[0];
            const text = await file.text();
            const importedNotes = JSON.parse(text);
            
            const result = await chrome.storage.local.get('notes');
            const currentNotes = result.notes || [];
            
            // Merge imported notes with current notes, avoiding duplicates
            const mergedNotes = [...currentNotes];
            importedNotes.forEach(note => {
                if (!currentNotes.some(n => n.id === note.id)) {
                    mergedNotes.push(note);
                }
            });
            
            await chrome.storage.local.set({ notes: mergedNotes });
            showStatus('Notes imported successfully!', true);
        } catch (error) {
            showStatus('Error importing notes: ' + error.message, false);
        }
    };
    
    input.click();
}

// Show status message
function showStatus(message, success) {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status-message ${success ? 'success' : 'error'}`;
    statusElement.style.display = 'block';
    
    setTimeout(() => {
        statusElement.style.display = 'none';
    }, 3000);
}

// Setup event listeners
function setupEventListeners() {
    // Save button
    document.getElementById('saveOptions').addEventListener('click', saveOptions);
    
    // Export button
    document.getElementById('exportData').addEventListener('click', exportNotes);
    
    // Import button
    document.getElementById('importData').addEventListener('click', importNotes);
    
    // Add category button
    document.getElementById('addCategory').addEventListener('click', () => {
        const categoryList = document.getElementById('categoryList');
        const categoryElement = createCategoryElement('');
        categoryList.appendChild(categoryElement);
    });
}
