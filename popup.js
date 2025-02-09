// Encryption handling
const encryption = {
    algorithm: { name: 'AES-GCM', length: 256 },
    key: null,
    keyId: null, // Track key version
    legacyKey: null, // Store legacy key for transition

    // Initialize encryption
    async init() {
        try {
            console.log('Initializing encryption...');
            const keyData = await this.getStoredKey();
            
            // Try to recover legacy key first
            const legacyKeyData = await chrome.storage.local.get('encryption_key');
            console.log('Legacy key data:', legacyKeyData.encryption_key ? 'found' : 'not found');
            
            if (legacyKeyData.encryption_key) {
                console.log('Importing legacy key...');
                try {
                    this.legacyKey = await window.crypto.subtle.importKey(
                        'jwk',
                        legacyKeyData.encryption_key,
                        this.algorithm,
                        true,
                        ['encrypt', 'decrypt']
                    );
                    console.log('Legacy key imported successfully');
                } catch (error) {
                    console.error('Failed to import legacy key:', error);
                }
            }
            
            if (keyData) {
                this.key = keyData.key;
                this.keyId = keyData.keyId;
                console.log('Using existing key:', this.keyId);
            } else {
                await this.generateAndStoreNewKey();
            }
            
            // If we have both keys, try to migrate notes
            if (this.legacyKey && this.key) {
                console.log('Both legacy and new keys available, attempting migration...');
                await this.migrateAllNotes();
            }
            
            console.log('Encryption initialized with:', {
                hasCurrentKey: !!this.key,
                hasLegacyKey: !!this.legacyKey,
                currentKeyId: this.keyId
            });
        } catch (error) {
            console.error('Encryption initialization failed:', error);
            throw error;
        }
    },

    // Generate a new encryption key
    async generateAndStoreNewKey() {
        try {
            console.log('Generating new encryption key...');
            this.key = await window.crypto.subtle.generateKey(
                this.algorithm,
                true,
                ['encrypt', 'decrypt']
            );
            this.keyId = Date.now().toString(); // Use timestamp as key version
            await this.storeKey(this.key);
            console.log('New key generated and stored:', this.keyId);
            return this.key;
        } catch (error) {
            console.error('Key generation failed:', error);
            throw error;
        }
    },

    // Store the encryption key
    async storeKey(key) {
        try {
            console.log('Exporting key for storage...');
            const exportedKey = await window.crypto.subtle.exportKey('jwk', key);
            await chrome.storage.local.set({ 
                'encryption_key': exportedKey,
                'encryption_key_id': this.keyId
            });
            console.log('Key stored successfully');
        } catch (error) {
            console.error('Key storage failed:', error);
            throw error;
        }
    },

    // Retrieve the stored encryption key
    async getStoredKey() {
        try {
            console.log('Retrieving stored key...');
            const result = await chrome.storage.local.get(['encryption_key', 'encryption_key_id']);
            
            if (result.encryption_key && result.encryption_key_id) {
                console.log('Found stored key:', result.encryption_key_id);
                const key = await window.crypto.subtle.importKey(
                    'jwk',
                    result.encryption_key,
                    this.algorithm,
                    true,
                    ['encrypt', 'decrypt']
                );
                return { key, keyId: result.encryption_key_id };
            }
            console.log('No stored key found');
            return null;
        } catch (error) {
            console.error('Key retrieval failed:', error);
            throw error;
        }
    },

    // Migrate all notes to new key
    async migrateAllNotes() {
        try {
            console.log('Starting note migration process...');
            const result = await chrome.storage.local.get('notes');
            const notes = result.notes || [];
            let migrated = false;

            const migratedNotes = await Promise.all(notes.map(async (note) => {
                try {
                    if (!note.text || typeof note.text !== 'object') {
                        return note;
                    }

                    // Try to decrypt with legacy key
                    const decrypted = await this.decryptWithKey(
                        note.text.encrypted,
                        note.text.iv,
                        this.legacyKey
                    );

                    if (decrypted) {
                        console.log('Successfully decrypted note with legacy key:', note.id);
                        // Re-encrypt with new key
                        const newEncrypted = await this.encrypt(decrypted);
                        migrated = true;
                        return {
                            ...note,
                            text: newEncrypted
                        };
                    }
                    return note;
                } catch (error) {
                    console.error('Failed to migrate note:', note.id, error);
                    return note;
                }
            }));

            if (migrated) {
                console.log('Saving migrated notes...');
                await chrome.storage.local.set({ notes: migratedNotes });
                console.log('Notes migration complete');
            }
        } catch (error) {
            console.error('Note migration failed:', error);
        }
    },

    // Decrypt with a specific key
    async decryptWithKey(encryptedData, iv, key) {
        try {
            if (!encryptedData || !iv || !key) {
                console.debug('Missing required decryption data:', {
                    hasEncryptedData: !!encryptedData,
                    hasIv: !!iv,
                    hasKey: !!key
                });
                return null;
            }

            console.debug('Attempting decryption with key:', {
                dataLength: encryptedData.length,
                ivLength: iv.length
            });

            const decrypted = await window.crypto.subtle.decrypt(
                {
                    name: this.algorithm.name,
                    iv: new Uint8Array(iv)
                },
                key,
                new Uint8Array(encryptedData)
            );
            
            const result = new TextDecoder().decode(decrypted);
            console.debug('Decryption successful, text length:', result.length);
            return result;
        } catch (error) {
            console.debug('Decryption with key failed:', error.message);
            return null;
        }
    },

    // Encrypt text
    async encrypt(text) {
        try {
            console.log('Starting encryption...');
            if (!this.key) {
                throw new Error('Encryption key not initialized');
            }

            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            console.log('Generated IV:', Array.from(iv));
            
            const encodedText = new TextEncoder().encode(text);
            console.log('Text encoded, length:', encodedText.length);
            
            const encryptedData = await window.crypto.subtle.encrypt(
                {
                    name: this.algorithm.name,
                    iv: iv
                },
                this.key,
                encodedText
            );

            const result = {
                encrypted: Array.from(new Uint8Array(encryptedData)),
                iv: Array.from(iv),
                keyId: this.keyId // Store key ID with encrypted data
            };
            console.log('Encryption successful, data length:', result.encrypted.length);
            return result;
        } catch (error) {
            console.error('Encryption failed:', error);
            throw error;
        }
    },

    // Decrypt text
    async decrypt(encryptedData, iv, keyId) {
        try {
            console.log('Starting decryption...', { 
                keyId, 
                currentKeyId: this.keyId,
                hasLegacyKey: !!this.legacyKey,
                dataLength: encryptedData?.length,
                ivLength: iv?.length
            });
            
            // First try with current key
            console.log('Attempting decryption with current key...');
            const decrypted = await this.decryptWithKey(encryptedData, iv, this.key);
            if (decrypted) {
                console.log('Successfully decrypted with current key');
                return decrypted;
            }

            // If that fails and we have a legacy key, try that
            if (this.legacyKey) {
                console.log('Attempting decryption with legacy key...');
                const legacyDecrypted = await this.decryptWithKey(encryptedData, iv, this.legacyKey);
                if (legacyDecrypted) {
                    console.log('Successfully decrypted with legacy key');
                    return legacyDecrypted;
                }
            }

            console.error('Decryption failed with all available keys');
            return '[Encrypted note - Click edit to recover]';
        } catch (error) {
            console.error('Decryption failed:', {
                error: error.message,
                keyExists: !!this.key,
                legacyKeyExists: !!this.legacyKey,
                dataLength: encryptedData?.length,
                ivLength: iv?.length,
                keyId
            });
            return '[Encrypted note - Click edit to recover]';
        }
    }
};

// Constants for storage limits
const STORAGE_LIMITS = {
    MAX_NOTE_SIZE_BYTES: 4194304, // 4MB
    WARNING_THRESHOLD_BYTES: 4194304, // Show warning when 4MB of storage is used
    MAX_NOTES_COUNT: 10000
};

// Error handler
const errorHandler = {
    // Show error message to user
    showError(message) {
        const errorContainer = document.getElementById('error-container');
        const errorMessage = document.getElementById('error-message');
        if (errorContainer && errorMessage) {
            errorMessage.textContent = message;
            errorContainer.style.display = 'block';
            setTimeout(() => {
                errorContainer.style.display = 'none';
            }, 5000);
        }
    },

    // Check storage quota
    async checkStorageQuota() {
        try {
            // Get current storage usage
            const bytesInUse = await new Promise((resolve) => {
                chrome.storage.local.getBytesInUse(null, resolve);
            });

            // Chrome storage limit is 5MB (5,242,880 bytes)
            const STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB in bytes
            const WARNING_THRESHOLD = 0.8; // 80% of limit

            console.log('Storage usage:', {
                used: bytesInUse,
                limit: STORAGE_LIMIT,
                percentUsed: (bytesInUse / STORAGE_LIMIT) * 100
            });

            if (bytesInUse >= STORAGE_LIMIT) {
                throw new Error('Storage quota exceeded. Please delete some notes.');
            }

            if (bytesInUse >= STORAGE_LIMIT * WARNING_THRESHOLD) {
                this.showError(`Storage is ${Math.round((bytesInUse / STORAGE_LIMIT) * 100)}% full. Consider deleting old notes.`);
            }

            return true;
        } catch (error) {
            console.error('Storage quota check failed:', error);
            throw error;
        }
    }
};

// Save a new note
async function saveNewNote() {
    const noteInput = document.getElementById('noteInput');
    const categorySelect = document.getElementById('categorySelect');
    const text = noteInput.value.trim();
    const category = categorySelect.value;

    if (!text) {
        errorHandler.showError('Please enter some text for your note.');
        return;
    }

    try {
        // Check storage quota before encrypting
        await errorHandler.checkStorageQuota();

        // Get existing notes
        const result = await safeStorageGet('notes');
        const notes = result.notes || [];

        // Calculate approximate size of new note
        const noteSize = new TextEncoder().encode(text).length;
        if (noteSize > 1024 * 1024) { // 1MB limit per note
            throw new Error('Note is too large. Please keep notes under 1MB.');
        }

        // Encrypt the note text
        const encryptedData = await encryption.encrypt(text);

        // Create new note object
        const newNote = {
            id: Date.now(),
            text: encryptedData,
            category: category,
            timestamp: new Date().toISOString()
        };

        // Add to beginning of array (newest first)
        notes.unshift(newNote);

        // Check storage again after preparing new data
        await errorHandler.checkStorageQuota();

        // Save updated notes
        await chrome.storage.local.set({ notes: notes });

        // Clear input and reload notes
        noteInput.value = '';
        await loadNotes();

    } catch (error) {
        console.error('Error saving note:', error);
        errorHandler.showError(error.message);
    }
}

// Debug function to inspect storage
async function inspectStorage() {
    const data = await chrome.storage.local.get(null);
    console.log('Storage contents:', {
        hasEncryptionKey: !!data.encryption_key,
        hasVersionedKey: !!data.encryption_key_id,
        keyFormat: data.encryption_key ? typeof data.encryption_key : 'none',
        noteCount: data.notes?.length || 0,
        noteFormats: data.notes?.map(note => ({
            id: note.id,
            textFormat: typeof note.text,
            hasEncrypted: note.text?.encrypted !== undefined,
            hasIv: note.text?.iv !== undefined
        }))
    });
}

// Initialize the notes list when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await inspectStorage();
        await encryption.init();
        await loadNotes();
        
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
        
        // Add reset button if there are unrecoverable notes
        const notes = await safeStorageGet('notes');
        if (notes.notes?.some(note => !note.text?.keyId)) {
            const resetButton = document.createElement('button');
            resetButton.textContent = 'Reset Storage';
            resetButton.className = 'reset-btn';
            resetButton.onclick = resetStorage;
            
            const header = document.querySelector('.header');
            header.appendChild(resetButton);
            
            // Add warning message
            const warning = document.createElement('div');
            warning.className = 'warning-message';
            warning.textContent = 'Some notes cannot be recovered. You may need to reset storage to continue.';
            header.appendChild(warning);
        }
        
        // Add styles for new elements
        const style = document.createElement('style');
        style.textContent = `
            .reset-btn {
                background-color: #dc3545;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-left: 10px;
            }
            
            .reset-btn:hover {
                background-color: #c82333;
            }
            
            .warning-message {
                color: #dc3545;
                margin-top: 10px;
                font-size: 14px;
                text-align: center;
            }
        `;
        document.head.appendChild(style);
    } catch (error) {
        console.error('Initialization failed:', error);
        errorHandler.showError('Failed to initialize extension. Please refresh the page.');
    }
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

// Load and display notes
async function loadNotes() {
    try {
        const result = await safeStorageGet('notes');
        const notes = result.notes || [];
        
        console.log('Loading notes, count:', notes.length);
        console.log('Notes structure:', notes.map(note => ({
            id: note.id,
            hasText: !!note.text,
            textType: typeof note.text,
            isEncrypted: note.text && typeof note.text === 'object' && !!note.text.encrypted,
            ivLength: note.text?.iv?.length,
            category: note.category,
            timestamp: note.timestamp
        })));
        
        // Clear existing notes
        const notesContainer = document.getElementById('notes-container');
        if (!notesContainer) {
            throw new Error('Notes container element not found');
        }
        notesContainer.innerHTML = '';
        
        // Sort notes by timestamp (newest first)
        notes.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        let hasInvalidNotes = false;
        const validNotes = [];

        for (const note of notes) {
            try {
                // Validate note structure
                if (!isValidNoteFormat(note)) {
                    console.warn('Invalid note format detected:', {
                        id: note.id,
                        textType: typeof note.text,
                        hasEncrypted: note.text?.encrypted !== undefined,
                        hasIv: note.text?.iv !== undefined,
                        ivType: note.text?.iv ? typeof note.text.iv : 'undefined'
                    });
                    hasInvalidNotes = true;
                    
                    // Try to migrate old note format
                    const migratedNote = await migrateNoteFormat(note);
                    if (migratedNote) {
                        validNotes.push(migratedNote);
                        console.log('Successfully migrated note:', migratedNote.id);
                    }
                    continue;
                }
                
                validNotes.push(note);
                const noteElement = await createNoteElement(note);
                if (noteElement) {
                    notesContainer.appendChild(noteElement);
                }
            } catch (error) {
                console.error('Error processing note:', {
                    noteId: note.id,
                    error: error.message,
                    note: {
                        hasText: !!note.text,
                        textType: typeof note.text,
                        hasEncrypted: note.text?.encrypted !== undefined,
                        hasIv: note.text?.iv !== undefined
                    }
                });
            }
        }

        // If we had any invalid notes, save the valid ones back
        if (hasInvalidNotes) {
            console.log('Saving migrated notes...', validNotes.length);
            await chrome.storage.local.set({ notes: validNotes });
        }

        // Update UI elements
        const emptyState = document.getElementById('empty-state');
        if (emptyState) {
            emptyState.style.display = validNotes.length === 0 ? 'block' : 'none';
        }
        
        updateNotesCount(validNotes.length);
    } catch (error) {
        console.error('Error in loadNotes:', error);
        errorHandler.showError(`Failed to load notes: ${error.message}`);
    }
}

// Update the notes count in the UI
function updateNotesCount(count) {
    const countElement = document.getElementById('notes-count');
    if (countElement) {
        countElement.textContent = `${count || 0} note${count === 1 ? '' : 's'}`;
    }
}

// Validate note format
function isValidNoteFormat(note) {
    if (!note || !note.id || !note.text) {
        console.debug('Note missing required fields:', { 
            hasNote: !!note, 
            hasId: !!note?.id, 
            hasText: !!note?.text 
        });
        return false;
    }
    
    if (typeof note.text !== 'object') {
        console.debug('Note text is not an object:', typeof note.text);
        return false;
    }
    
    if (!Array.isArray(note.text.encrypted) || !Array.isArray(note.text.iv)) {
        console.debug('Note encrypted data or IV is not an array:', {
            encryptedIsArray: Array.isArray(note.text.encrypted),
            ivIsArray: Array.isArray(note.text.iv)
        });
        return false;
    }
    
    if (note.text.iv.length !== 12) {
        console.debug('Invalid IV length:', note.text.iv.length);
        return false;
    }
    
    return true;
}

// Migrate old note format to new format
async function migrateNoteFormat(note) {
    try {
        // If note is just a string or old format
        if (typeof note.text === 'string' || !note.text.encrypted) {
            console.log('Migrating old note format:', note.id);
            const encryptedData = await encryption.encrypt(note.text.toString());
            return {
                ...note,
                text: encryptedData,
                timestamp: note.timestamp || Date.now()
            };
        }
        
        // If note has encrypted data but in wrong format
        if (note.text.encrypted && !Array.isArray(note.text.encrypted)) {
            console.log('Fixing encrypted data format:', note.id);
            return {
                ...note,
                text: {
                    encrypted: Array.from(new Uint8Array(note.text.encrypted)),
                    iv: Array.isArray(note.text.iv) ? note.text.iv : Array.from(new Uint8Array(note.text.iv)),
                    keyId: note.text.keyId || encryption.keyId // Preserve or set key ID
                },
                timestamp: note.timestamp || Date.now()
            };
        }

        // If note is missing keyId, add it
        if (!note.text.keyId) {
            console.log('Adding keyId to note:', note.id);
            return {
                ...note,
                text: {
                    ...note.text,
                    keyId: encryption.keyId
                },
                timestamp: note.timestamp || Date.now()
            };
        }

        return null;
    } catch (error) {
        console.error('Failed to migrate note:', note.id, error);
        return null;
    }
}

// Function to create a note element
async function createNoteElement(note) {
    const div = document.createElement('div');
    div.className = 'note-item';
    div.dataset.id = note.id;
    div.dataset.category = note.category || 'other';

    try {
        const decryptedText = await encryption.decrypt(note.text.encrypted, note.text.iv, note.text.keyId);
        if (!decryptedText) {
            console.error('Failed to decrypt note:', note.id);
            throw new Error('Could not decrypt note');
        }

        const textDiv = document.createElement('div');
        textDiv.className = 'note-text';
        textDiv.textContent = decryptedText;
        div.appendChild(textDiv);

        // Add category label
        const categorySpan = document.createElement('span');
        categorySpan.className = `note-category category-${note.category}`;
        categorySpan.textContent = note.category;
        textDiv.prepend(categorySpan);

        // Add actions
        const actions = document.createElement('div');
        actions.className = 'note-actions';
        
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(decryptedText);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy';
            }, 1500);
        };
        
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => enableNoteEditing(div, note);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.onclick = async () => {
            if (confirm('Are you sure you want to delete this note?')) {
                const notes = await safeStorageGet('notes');
                const updatedNotes = notes.notes.filter(n => n.id !== note.id);
                await chrome.storage.local.set({ notes: updatedNotes });
                await loadNotes();
            }
        };
        
        actions.appendChild(copyBtn);
        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        div.appendChild(actions);

        return div;
    } catch (error) {
        console.error('Error creating note element:', error);
        errorHandler.showError(`Error loading note: ${error.message}`);
        return null;
    }
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
        textToEdit = await encryption.decrypt(note.text.encrypted, note.text.iv, note.text.keyId);
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

// Reset storage and start fresh
async function resetStorage() {
    try {
        console.log('Resetting storage...');
        
        // Generate new encryption key
        await encryption.generateAndStoreNewKey();
        
        // Clear all notes
        await chrome.storage.local.set({ notes: [] });
        
        // Clear any old keys
        const keysToRemove = ['encryption_key'];
        await chrome.storage.local.remove(keysToRemove);
        
        console.log('Storage reset complete');
        
        // Reload notes
        await loadNotes();
        
        // Show success message
        errorHandler.showError('Storage has been reset. You can now add new notes.');
    } catch (error) {
        console.error('Failed to reset storage:', error);
        errorHandler.showError('Failed to reset storage. Please try again.');
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
