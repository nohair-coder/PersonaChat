Component({
  properties: {
    text: { type: String, value: '' },
    // closable: whether to show the close button.
    // Deferred product/compliance decision: does closing persist (never show again)
    // or only apply for current session? Default: session-only (visible resets each visit).
    // Do NOT set persistClose=true until product/compliance has confirmed it doesn't
    // conflict with R10's "always visible" requirement.
    closable: { type: Boolean, value: true },
  },

  data: {
    visible: true,
  },

  methods: {
    onClose() {
      this.setData({ visible: false });
      this.triggerEvent('close');
    },

    show() {
      this.setData({ visible: true });
    },
  },
});
