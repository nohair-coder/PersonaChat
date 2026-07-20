const characterApi = require('../../services/character-api');
const auth = require('../../utils/auth');

Page({
  data: {
    loading: false,
    loadError: false,
    allPersonas: [],
    featuredPersonas: [],
    filteredPersonas: [],
    searchKeyword: '',
    swiperCurrent: 0,
  },

  // Navigation guard to prevent double-tap
  _navigating: false,

  onLoad() {
    this.loadPersonas();
  },

  onShow() {
    // Reset navigation flag each time the page comes to foreground
    this._navigating = false;
  },

  onPullDownRefresh() {
    this.loadPersonas().finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadPersonas() {
    this.setData({ loading: true, loadError: false });
    try {
      const list = await characterApi.getList();
      const featured = list.filter((p) => p.featured);
      this.setData({
        allPersonas: list,
        featuredPersonas: featured,
        filteredPersonas: this._applySearch(list, this.data.searchKeyword),
        loading: false,
      });
    } catch (err) {
      console.error('[home] loadPersonas error', err);
      this.setData({ loading: false, loadError: true });
    }
  },

  onRetry() {
    this.loadPersonas();
  },

  onSearchChange(e) {
    const keyword = e.detail.value || '';
    this.setData({
      searchKeyword: keyword,
      filteredPersonas: this._applySearch(this.data.allPersonas, keyword),
    });
  },

  onSearchClear() {
    this.setData({
      searchKeyword: '',
      filteredPersonas: this._applySearch(this.data.allPersonas, ''),
    });
  },

  _applySearch(list, keyword) {
    if (!keyword || !keyword.trim()) return list;
    const kw = keyword.trim().toLowerCase();
    return list.filter((p) => {
      const nameMatch = p.name && p.name.toLowerCase().includes(kw);
      const descMatch = p.description && p.description.toLowerCase().includes(kw);
      return nameMatch || descMatch;
    });
  },

  onSwiperChange(e) {
    this.setData({ swiperCurrent: e.detail.current });
  },

  // Featured swiper tap
  onPersonaTap(e) {
    const personaId = e.currentTarget.dataset.id;
    this._navigateToChat(personaId);
  },

  // Persona card tap (event bubbled from component)
  onPersonaCardTap(e) {
    const personaId = e.detail && e.detail.id;
    if (!personaId) return;
    this._navigateToChat(personaId);
  },

  _navigateToChat(personaId) {
    if (this._navigating) return;
    this._navigating = true;

    const url = `/subpackages/chat/pages/chat/chat?personaId=${personaId}`;
    auth.requireAuth(url, {
      onCancel: () => {
        // User dismissed auth — allow retry
        this._navigating = false;
      },
      onError: () => {
        this._navigating = false;
      },
    });

    // Safety timeout: reset flag if navigation didn't happen within 2s
    setTimeout(() => {
      this._navigating = false;
    }, 2000);
  },
});
