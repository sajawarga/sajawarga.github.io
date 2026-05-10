// SAJAWARGA - Wikipedia Search Engine

(function() {
    'use strict';

    // DOM Elements
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const resultsSection = document.getElementById('resultsSection');
    const resultsContainer = document.getElementById('resultsContainer');
    const resultStats = document.getElementById('resultStats');
    const loadingOverlay = document.getElementById('loadingOverlay');

    // Helper Functions
    function showLoading() {
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // JSONP Request
    function jsonpRequest(url) {
        return new Promise((resolve, reject) => {
            const callback = `cb_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            const script = document.createElement('script');
            
            const timeout = setTimeout(() => {
                delete window[callback];
                if (script.parentNode) script.parentNode.removeChild(script);
                reject(new Error('Timeout'));
            }, 10000);
            
            window[callback] = (data) => {
                clearTimeout(timeout);
                delete window[callback];
                if (script.parentNode) script.parentNode.removeChild(script);
                resolve(data);
            };
            
            script.src = `${url}${url.includes('?') ? '&' : '?'}format=json&callback=${callback}`;
            script.onerror = () => {
                clearTimeout(timeout);
                delete window[callback];
                reject(new Error('Request failed'));
            };
            document.head.appendChild(script);
        });
    }

    // Get Wikipedia Extract
    async function getWikipediaExtract(title, language) {
        const baseUrl = language === 'id' ? 'https://id.wikipedia.org' : 'https://en.wikipedia.org';
        const url = `${baseUrl}/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&redirects=1`;
        
        try {
            const data = await jsonpRequest(url);
            if (data && data.query && data.query.pages) {
                const pages = data.query.pages;
                const pageId = Object.keys(pages)[0];
                if (pages[pageId] && pages[pageId].extract && pages[pageId].extract !== '') {
                    return {
                        title: pages[pageId].title,
                        extract: pages[pageId].extract
                    };
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    // Search Wikipedia
    async function searchWikipedia(query) {
        if (!query || query.trim() === '') {
            showToast('Masukkan kata kunci pencarian');
            return;
        }
        
        showLoading();
        resultsSection.style.display = 'none';
        
        try {
            const cleanQ = query.trim();
            let result = null;
            let isEnglish = false;
            let methodUsed = '';
            
            // Try Indonesia first
            const idResult = await getWikipediaExtract(cleanQ, 'id');
            if (idResult && idResult.extract && !idResult.extract.includes('dialihkan')) {
                result = idResult;
                methodUsed = 'Wikipedia Indonesia';
            }
            
            // Try English
            if (!result) {
                const enResult = await getWikipediaExtract(cleanQ, 'en');
                if (enResult && enResult.extract && !enResult.extract.includes('redirect')) {
                    result = enResult;
                    isEnglish = true;
                    methodUsed = 'Wikipedia Inggris';
                }
            }
            
            // Try search suggestions if not found
            if (!result) {
                await showSearchSuggestions(cleanQ);
                hideLoading();
                return;
            }
            
            // Display result
            if (result && result.extract) {
                let extract = result.extract;
                if (extract.length > 1500) extract = extract.substring(0, 1500) + '...';
                
                const langBadge = isEnglish ? '🇬🇧 English' : '🇮🇩 Indonesia';
                
                const html = `
                    <div class="result-card">
                        <div class="result-title">
                            <a href="https://${isEnglish ? 'en' : 'id'}.wikipedia.org/wiki/${encodeURIComponent(result.title)}" target="_blank">
                                ${escapeHtml(result.title)}
                            </a>
                        </div>
                        <div class="result-lang">${langBadge}</div>
                        <div class="result-method">
                            <i class="fas fa-search"></i> Ditemukan via: ${methodUsed}
                        </div>
                        <div class="result-snippet">
                            ${escapeHtml(extract)}
                        </div>
                        <div class="result-buttons">
                            <button class="copy-btn" data-text="${escapeHtml(extract).replace(/"/g, '&quot;')}">
                                <i class="fas fa-copy"></i> Salin Teks
                            </button>
                            ${isEnglish ? `
                                <button class="translate-btn" data-text="${escapeHtml(extract).replace(/"/g, '&quot;')}">
                                    <i class="fas fa-language"></i> Terjemahkan ke Indonesia
                                </button>
                            ` : ''}
                        </div>
                        <div class="result-link">
                            <a href="https://${isEnglish ? 'en' : 'id'}.wikipedia.org/wiki/${encodeURIComponent(result.title)}" target="_blank">
                                🔗 Baca selengkapnya di Wikipedia ${isEnglish ? 'Inggris' : 'Indonesia'} →
                            </a>
                        </div>
                    </div>
                `;
                
                resultsContainer.innerHTML = html;
                resultStats.innerHTML = `Menampilkan hasil untuk "${escapeHtml(cleanQ)}"`;
                resultsSection.style.display = 'block';
            }
            
        } catch (error) {
            console.error('Search error:', error);
            showToast('Gagal mencari. Coba kata kunci lain.');
        } finally {
            hideLoading();
        }
    }
    
    // Show search suggestions
    async function showSearchSuggestions(query) {
        try {
            const searchUrl = `https://id.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=6`;
            const data = await jsonpRequest(searchUrl);
            
            if (data && data.query && data.query.search && data.query.search.length > 0) {
                let html = `<div class="result-card">
                    <div class="result-title">Hasil terkait "${escapeHtml(query)}"</div>
                    <div class="suggestions-list">`;
                
                for (let item of data.query.search) {
                    html += `
                        <div class="suggestion-item">
                            <span class="suggestion-title">${escapeHtml(item.title)}</span>
                            <button class="suggestion-btn" data-title="${escapeHtml(item.title)}">
                                <i class="fas fa-search"></i> Cari
                            </button>
                        </div>
                    `;
                }
                
                html += `</div></div>`;
                resultsContainer.innerHTML = html;
                resultStats.innerHTML = `Tidak menemukan "${escapeHtml(query)}". Coba salah satu berikut:`;
                resultsSection.style.display = 'block';
            } else {
                resultsContainer.innerHTML = `<div class="result-card">
                    <div class="result-title">Tidak ditemukan hasil</div>
                    <div class="result-snippet">Coba kata kunci lain seperti "pemrograman", "teknologi", atau "sejarah".</div>
                </div>`;
                resultStats.innerHTML = `Tidak ada hasil untuk "${escapeHtml(query)}"`;
                resultsSection.style.display = 'block';
            }
        } catch (error) {
            resultsContainer.innerHTML = `<div class="result-card">
                <div class="result-title">Terjadi kesalahan</div>
                <div class="result-snippet">Silakan coba lagi nanti.</div>
            </div>`;
            resultsSection.style.display = 'block';
        }
    }
    
    // Copy to clipboard
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('✓ Teks berhasil disalin!');
            return true;
        } catch(err) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('✓ Teks berhasil disalin!');
            return true;
        }
    }
    
    // Event Listeners
    searchBtn.addEventListener('click', () => {
        searchWikipedia(searchInput.value);
    });
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchWikipedia(searchInput.value);
        }
    });
    
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('copy-btn') || e.target.closest('.copy-btn')) {
            const btn = e.target.classList.contains('copy-btn') ? e.target : e.target.closest('.copy-btn');
            const text = btn.getAttribute('data-text');
            if (text) await copyToClipboard(text);
        }
        
        if (e.target.classList.contains('translate-btn') || e.target.closest('.translate-btn')) {
            const btn = e.target.classList.contains('translate-btn') ? e.target : e.target.closest('.translate-btn');
            const text = btn.getAttribute('data-text');
            if (text) {
                window.open(`https://translate.google.com/?sl=en&tl=id&text=${encodeURIComponent(text)}&op=translate`, '_blank');
            }
        }
        
        if (e.target.classList.contains('suggestion-btn') || e.target.closest('.suggestion-btn')) {
            const btn = e.target.classList.contains('suggestion-btn') ? e.target : e.target.closest('.suggestion-btn');
            const title = btn.getAttribute('data-title');
            if (title) {
                searchInput.value = title;
                searchWikipedia(title);
            }
        }
    });
    
    // Auto focus
    searchInput.focus();
    
})();