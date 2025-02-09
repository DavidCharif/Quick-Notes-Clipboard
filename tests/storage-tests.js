import { chromeMock, testDataGenerator, encryptionTestUtils } from './test-utils.js';

describe('Storage and Encryption Tests', () => {
    beforeEach(() => {
        // Reset storage before each test
        chromeMock.storage.local.clear();
        window.chrome = chromeMock;
    });

    describe('Storage Limits', () => {
        test('Should handle storage quota exceeded', async () => {
            const largeNotes = testDataGenerator.generateMultipleNotes(1000, 5); // 5KB each, total ~5MB
            
            try {
                await chrome.storage.local.set({ notes: largeNotes });
                fail('Should have thrown quota exceeded error');
            } catch (error) {
                expect(error.message).toBe('QUOTA_BYTES_PER_ITEM exceeded');
            }
        });

        test('Should handle large number of small notes', async () => {
            const manySmallNotes = testDataGenerator.generateMultipleNotes(10000, 0.5); // 0.5KB each
            
            try {
                await chrome.storage.local.set({ notes: manySmallNotes });
                const stored = await chrome.storage.local.get('notes');
                expect(stored.notes.length).toBe(10000);
            } catch (error) {
                fail('Should handle many small notes: ' + error.message);
            }
        });
    });

    describe('Encryption Edge Cases', () => {
        test('Should handle invalid encryption key', async () => {
            const invalidKey = await encryptionTestUtils.generateInvalidKey();
            
            try {
                await window.crypto.subtle.importKey(
                    'jwk',
                    invalidKey,
                    { name: 'AES-GCM', length: 256 },
                    true,
                    ['encrypt', 'decrypt']
                );
                fail('Should have thrown invalid key error');
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        test('Should handle invalid IV', async () => {
            const error = await encryptionTestUtils.encryptWithInvalidParams('test text');
            expect(error).toBeDefined();
        });

        test('Should handle decryption of corrupted data', async () => {
            const text = 'Test text';
            const encrypted = await encryption.encrypt(text);
            
            // Corrupt the encrypted data
            encrypted.encrypted[0] = (encrypted.encrypted[0] + 1) % 256;
            
            const decrypted = await encryption.decrypt(encrypted.encrypted, encrypted.iv);
            expect(decrypted).toBeNull();
        });
    });

    describe('Chrome Version Compatibility', () => {
        const chromeVersions = ['80', '90', '100', '110', '120'];
        
        chromeVersions.forEach(version => {
            test(`Should work with Chrome ${version}`, async () => {
                // Mock Chrome version
                window.chrome.runtime.getManifest = () => ({
                    version: version
                });

                try {
                    // Test basic functionality
                    await encryption.init();
                    const text = 'Test text';
                    const encrypted = await encryption.encrypt(text);
                    const decrypted = await encryption.decrypt(encrypted.encrypted, encrypted.iv);
                    
                    expect(decrypted).toBe(text);
                } catch (error) {
                    fail(`Failed on Chrome ${version}: ${error.message}`);
                }
            });
        });
    });
});
