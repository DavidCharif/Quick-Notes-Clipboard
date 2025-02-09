// Chrome Storage Mock
const storageMock = {
    local: {
        data: new Map(),
        QUOTA_BYTES: 5242880, // Chrome's default local storage quota (5MB)
        bytesInUse: 0,

        async get(keys) {
            if (typeof keys === 'string') {
                return { [keys]: this.data.get(keys) };
            }
            if (Array.isArray(keys)) {
                const result = {};
                keys.forEach(key => {
                    result[key] = this.data.get(key);
                });
                return result;
            }
            return Object.fromEntries(this.data);
        },

        async set(items) {
            const itemsSize = new TextEncoder().encode(JSON.stringify(items)).length;
            if (this.bytesInUse + itemsSize > this.QUOTA_BYTES) {
                throw new Error('QUOTA_BYTES_PER_ITEM exceeded');
            }
            
            Object.entries(items).forEach(([key, value]) => {
                const oldSize = this.data.has(key) ? 
                    new TextEncoder().encode(JSON.stringify(this.data.get(key))).length : 0;
                this.bytesInUse = this.bytesInUse - oldSize + itemsSize;
                this.data.set(key, value);
            });
        },

        async clear() {
            this.data.clear();
            this.bytesInUse = 0;
        }
    }
};

// Chrome API Mock
const chromeMock = {
    storage: storageMock,
    runtime: {
        lastError: null
    }
};

// Test Data Generator
const testDataGenerator = {
    generateLargeNote(sizeInKB) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const iterations = (sizeInKB * 1024) / chars.length;
        for (let i = 0; i < iterations; i++) {
            result += chars;
        }
        return result;
    },

    generateMultipleNotes(count, averageSizeInKB = 1) {
        const notes = [];
        for (let i = 0; i < count; i++) {
            notes.push({
                id: Date.now() + i,
                text: this.generateLargeNote(averageSizeInKB),
                category: ['sql', 'url', 'snippet', 'command', 'other'][i % 5],
                timestamp: new Date(Date.now() - i * 1000).toISOString()
            });
        }
        return notes;
    }
};

// Encryption Test Utils
const encryptionTestUtils = {
    async generateInvalidKey() {
        const key = await window.crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        const exported = await window.crypto.subtle.exportKey('jwk', key);
        // Corrupt the key
        exported.k = exported.k.substring(1) + 'X';
        return exported;
    },

    generateInvalidIV() {
        return new Uint8Array(11); // Invalid length, should be 12
    },

    async encryptWithInvalidParams(text) {
        const key = await window.crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
        const iv = this.generateInvalidIV();
        const encodedText = new TextEncoder().encode(text);
        
        try {
            await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                encodedText
            );
        } catch (error) {
            return error;
        }
    }
};

export { chromeMock, testDataGenerator, encryptionTestUtils };
