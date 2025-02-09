// Encryption handling
const encryption = {
    algorithm: { name: 'AES-GCM', length: 256 },
    key: null,

    // Initialize encryption
    async init() {
        this.key = await this.getStoredKey();
        if (!this.key) {
            this.key = await this.generateNewKey();
            await this.storeKey(this.key);
        }
    },

    // Generate a new encryption key
    async generateNewKey() {
        return await window.crypto.subtle.generateKey(
            this.algorithm,
            true,
            ['encrypt', 'decrypt']
        );
    },

    // Store the encryption key
    async storeKey(key) {
        const exportedKey = await window.crypto.subtle.exportKey('jwk', key);
        await chrome.storage.local.set({ 'encryption_key': exportedKey });
    },

    // Retrieve the stored encryption key
    async getStoredKey() {
        const result = await chrome.storage.local.get(['encryption_key']);
        if (result.encryption_key) {
            return await window.crypto.subtle.importKey(
                'jwk',
                result.encryption_key,
                this.algorithm,
                true,
                ['encrypt', 'decrypt']
            );
        }
        return await this.generateNewKey();
    },

    // Encrypt text
    async encrypt(text) {
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encodedText = new TextEncoder().encode(text);
        
        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: this.algorithm.name,
                iv: iv
            },
            this.key,
            encodedText
        );

        return {
            encrypted: Array.from(new Uint8Array(encryptedData)),
            iv: Array.from(iv)
        };
    },

    // Decrypt text
    async decrypt(encryptedData, iv) {
        try {
            const decrypted = await window.crypto.subtle.decrypt(
                {
                    name: this.algorithm.name,
                    iv: new Uint8Array(iv)
                },
                this.key,
                new Uint8Array(encryptedData)
            );
            
            return new TextDecoder().decode(decrypted);
        } catch (error) {
            console.error('Decryption failed:', error);
            return null;
        }
    }
};

// Constants for storage limits
const STORAGE_LIMITS = {
    MAX_NOTE_SIZE_BYTES: 4194304, // 4MB
    WARNING_THRESHOLD_BYTES: 4194304, // Show warning when 4MB of storage is used
    MAX_NOTES_COUNT: 10000
};

// Error handling utility
const errorHandler = {
    showError(message, type = 'error') {
        const errorDiv = document.getElementById('errorMessage') || (() => {
            const div = document.createElement('div');
            div.id = 'errorMessage';
            div.className = 'message ' + type;
            document.querySelector('.container').prepend(div);
            return div;
        })();
        
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    },

    async checkStorageQuota() {
        try {
            const { bytesInUse, QUOTA_BYTES } = await chrome.storage.local.getBytesInUse();
            if (bytesInUse > STORAGE_LIMITS.WARNING_THRESHOLD_BYTES) {
                this.showError(`Storage usage: ${Math.round(bytesInUse / 1048576)}MB / ${Math.round(QUOTA_BYTES / 1048576)}MB`, 'warning');
            }
            return bytesInUse < QUOTA_BYTES;
        } catch (error) {
            console.error('Error checking storage quota:', error);
            return true; // Assume space available if check fails
        }
    }
};

// Initialize the notes list when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    await encryption.init();
    loadNotes();
    
    // Add event listener for saving new notes
    document.getElementById('saveNote').addEventListener('click', saveNewNote);
    
    // Add enter key support for saving notes
    document.getElementById('noteInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveNewNote();
        }
    });

    // Add search functionality
    document.getElementById('searchInput').addEventListener('input', () => {
        filterNotes();
    });

    // Add category filter functionality
    document.getElementById('categoryFilter').addEventListener('change', () => {
        filterNotes();
    });

    // Auto-detect URL category
    document.getElementById('noteInput').addEventListener('input', (e) => {
        const text = e.target.value.trim();
        const categorySelect = document.getElementById('categorySelect');
        if (isValidUrl(text)) {
            categorySelect.value = 'url';
        }
    });
});

// Function to check if text is a valid URL
function isValidUrl(text) {
    try {
        new URL(text);
        return true;
    } catch {
        return false;
    }
}

// Function to save a new note
async function saveNewNote() {
    const input = document.getElementById('noteInput');
    const categorySelect = document.getElementById('categorySelect');
    const noteText = input.value.trim();
    const category = categorySelect.value;
    const saveButton = document.getElementById('saveNote');
    
    if (!noteText) {
        errorHandler.showError('Note text cannot be empty');
        return;
    }

    try {
        saveButton.disabled = true;
        
        // Check note size
        const noteSize = new TextEncoder().encode(noteText).length;
        if (noteSize > STORAGE_LIMITS.MAX_NOTE_SIZE_BYTES) {
            throw new Error(`Note too large (${Math.round(noteSize / 1048576)}MB). Maximum size is ${STORAGE_LIMITS.MAX_NOTE_SIZE_BYTES / 1048576}MB`);
        }

        // Check storage quota
        if (!await errorHandler.checkStorageQuota()) {
            throw new Error('Storage quota exceeded. Please delete some notes.');
        }

        const notes = await safeStorageGet('notes');
        const existingNotes = notes.notes || [];
        
        // Check notes count
        if (existingNotes.length >= STORAGE_LIMITS.MAX_NOTES_COUNT) {
            throw new Error(`Maximum number of notes (${STORAGE_LIMITS.MAX_NOTES_COUNT}) reached. Please delete some notes.`);
        }

        // Encrypt the note text
        const encryptedData = await encryption.encrypt(noteText);
        if (!encryptedData) {
            throw new Error('Encryption failed. Please try again.');
        }
        
        const newNote = {
            id: Date.now(),
            text: encryptedData,
            category: category,
            timestamp: new Date().toISOString()
        };
        
        existingNotes.unshift(newNote);
        await chrome.storage.local.set({ notes: existingNotes });
        
        input.value = '';
        await loadNotes();
    } catch (error) {
        console.error('Error saving note:', error);
        errorHandler.showError(error.message);
    } finally {
        saveButton.disabled = false;
    }
}

// Function to load and display all notes
async function loadNotes() {
    const notesList = document.getElementById('notesList');
    const emptyState = document.getElementById('emptyState');
    
    try {
        const result = await safeStorageGet('notes');
        const notes = result.notes || [];
        
        notesList.innerHTML = '';
        
        if (notes.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        
        // Check storage quota
        await errorHandler.checkStorageQuota();
        
        for (const note of notes) {
            try {
                const noteElement = await createNoteElement(note);
                if (noteElement) {
                    notesList.appendChild(noteElement);
                }
            } catch (error) {
                console.error('Error creating note element:', error);
                // Continue with other notes if one fails
            }
        }

        filterNotes(); // Apply any active filters
    } catch (error) {
        console.error('Error loading notes:', error);
        errorHandler.showError('Error loading notes. Please refresh the page.');
    }
}

// Function to create a note element
function createNoteElement(note) {
    const div = document.createElement('div');
    div.className = 'note-item';
    div.dataset.id = note.id;
    div.dataset.category = note.category || 'other';
    
    const categorySpan = document.createElement('span');
    categorySpan.className = `note-category category-${note.category || 'other'}`;
    categorySpan.textContent = note.category ? note.category.toUpperCase() : 'OTHER';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'note-text';
    
    // Decrypt and display the note text
    if (typeof note.text === 'object' && note.text.encrypted) {
        encryption.decrypt(note.text.encrypted, note.text.iv)
            .then(decryptedText => {
                textSpan.textContent = decryptedText || 'Error: Could not decrypt note';
            })
            .catch(error => {
                console.error('Error decrypting note:', error);
                textSpan.textContent = 'Error: Could not decrypt note';
            });
    } else {
        // Handle existing unencrypted notes
        textSpan.textContent = note.text;
    }
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'note-actions';
    
    const editButton = document.createElement('button');
    editButton.className = 'edit-btn';
    editButton.textContent = 'Edit';
    editButton.onclick = () => enableNoteEditing(div, note);
    
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-btn';
    copyButton.textContent = 'Copy';
    copyButton.onclick = async () => {
        try {
            let textToCopy = note.text;
            if (typeof note.text === 'object' && note.text.encrypted) {
                textToCopy = await encryption.decrypt(note.text.encrypted, note.text.iv);
            }
            await navigator.clipboard.writeText(textToCopy);
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
                copyButton.textContent = 'Copy';
            }, 1000);
        } catch (error) {
            console.error('Error copying text:', error);
        }
    };
    
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-btn';
    deleteButton.textContent = 'Delete';
    deleteButton.onclick = async () => {
        if (confirm('Are you sure you want to delete this note?')) {
            try {
                const result = await safeStorageGet('notes');
                const notes = result.notes || [];
                const updatedNotes = notes.filter(n => n.id !== note.id);
                await chrome.storage.local.set({ notes: updatedNotes });
                await loadNotes();
            } catch (error) {
                console.error('Error deleting note:', error);
            }
        }
    };
    
    actionsDiv.appendChild(editButton);
    actionsDiv.appendChild(copyButton);
    actionsDiv.appendChild(deleteButton);
    div.appendChild(categorySpan);
    div.appendChild(textSpan);
    div.appendChild(actionsDiv);
    
    return div;
}

// Function to enable note editing
async function enableNoteEditing(noteElement, note) {
    const textSpan = noteElement.querySelector('.note-text');
    const actionsDiv = noteElement.querySelector('.note-actions');
    
    // Create edit input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'note-edit-input';
    let textToEdit = note.text;
    if (typeof note.text === 'object' && note.text.encrypted) {
        textToEdit = await encryption.decrypt(note.text.encrypted, note.text.iv);
    }
    input.value = textToEdit;
    
    // Create category select
    const categorySelect = document.createElement('select');
    categorySelect.className = 'note-edit-category';
    const categories = ['sql', 'url', 'snippet', 'command', 'other'];
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat.toUpperCase();
        option.selected = cat === note.category;
        categorySelect.appendChild(option);
    });
    
    // Create save and cancel buttons
    const saveButton = document.createElement('button');
    saveButton.className = 'save-edit-btn';
    saveButton.textContent = 'Save';
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'cancel-edit-btn';
    cancelButton.textContent = 'Cancel';
    
    // Store original elements
    const originalElements = {
        category: noteElement.querySelector('.note-category'),
        text: textSpan,
        buttons: Array.from(actionsDiv.children)
    };
    
    // Replace content with edit mode
    noteElement.replaceChild(input, textSpan);
    noteElement.querySelector('.note-category').replaceWith(categorySelect);
    actionsDiv.innerHTML = '';
    actionsDiv.appendChild(saveButton);
    actionsDiv.appendChild(cancelButton);
    
    input.focus();
    input.select();
    
    // Handle save
    saveButton.onclick = async () => {
        const newText = input.value.trim();
        const newCategory = categorySelect.value;
        if (newText) {
            try {
                const result = await safeStorageGet('notes');
                const notes = result.notes || [];
                const noteIndex = notes.findIndex(n => n.id === parseInt(noteElement.dataset.id));
                
                if (noteIndex !== -1) {
                    // Encrypt the new note text
                    const encryptedData = await encryption.encrypt(newText);
                    
                    notes[noteIndex].text = encryptedData;
                    notes[noteIndex].category = newCategory;
                    await chrome.storage.local.set({ notes: notes });
                    await loadNotes();
                }
            } catch (error) {
                console.error('Error updating note:', error);
                exitEditMode();
            }
        } else {
            exitEditMode();
        }
    };
    
    // Handle cancel
    cancelButton.onclick = exitEditMode;
    
    // Handle enter key
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveButton.click();
        }
    });
    
    function exitEditMode() {
        noteElement.replaceChild(originalElements.text, input);
        const categorySpan = document.createElement('span');
        categorySpan.className = `note-category category-${note.category || 'other'}`;
        categorySpan.textContent = note.category ? note.category.toUpperCase() : 'OTHER';
        noteElement.replaceChild(categorySpan, categorySelect);
        actionsDiv.innerHTML = '';
        originalElements.buttons.forEach(button => actionsDiv.appendChild(button));
    }
}

// Function to filter notes based on search term and category
function filterNotes() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const categoryFilter = document.getElementById('categoryFilter').value;
    const notes = document.querySelectorAll('.note-item');
    const emptyState = document.getElementById('emptyState');
    let visibleNotes = 0;
    
    notes.forEach(note => {
        const text = note.querySelector('.note-text').textContent.toLowerCase();
        const category = note.dataset.category;
        const matchesSearch = text.includes(searchTerm);
        const matchesCategory = !categoryFilter || category === categoryFilter;
        const isVisible = matchesSearch && matchesCategory;
        
        note.style.display = isVisible ? 'flex' : 'none';
        if (isVisible) visibleNotes++;
    });
    
    emptyState.style.display = visibleNotes === 0 ? 'block' : 'none';
    if (visibleNotes === 0) {
        if (searchTerm && categoryFilter) {
            emptyState.textContent = `No ${categoryFilter.toUpperCase()} notes found matching "${searchTerm}"`;
        } else if (searchTerm) {
            emptyState.textContent = `No notes found matching "${searchTerm}"`;
        } else if (categoryFilter) {
            emptyState.textContent = `No ${categoryFilter.toUpperCase()} notes found`;
        } else {
            emptyState.textContent = 'No notes yet! Add your first note above.';
        }
    }
}

// Safe storage getter with error handling
async function safeStorageGet(key) {
    try {
        return await new Promise(resolve => 
            chrome.storage.local.get([key], resolve)
        );
    } catch (error) {
        console.error('Storage error:', error);
        return {};
    }
}
