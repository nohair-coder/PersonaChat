Component({
  properties: {
    /** Path to an image shown above the message. Optional. */
    icon: {
      type: String,
      value: '',
    },
    /** Primary message text shown to the user. */
    text: {
      type: String,
      value: '暂无数据',
    },
    /** Label for the optional action button. When empty the button is hidden. */
    actionText: {
      type: String,
      value: '',
    },
  },

  data: {},

  methods: {
    onActionTap() {
      this.triggerEvent('action');
    },
  },
});
