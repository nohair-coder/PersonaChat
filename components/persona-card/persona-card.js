Component({
  properties: {
    /**
     * Persona object shape:
     *   id          {string|number}
     *   name        {string}
     *   description {string}
     *   avatarUrl   {string}
     *   tags        {Array<string>}
     *   featured    {boolean}
     */
    persona: {
      type: Object,
      value: {},
    },
  },

  data: {},

  methods: {
    onTap() {
      const { id } = this.data.persona;
      if (!id) return;
      // Bubble the tap event with the persona id so the parent page
      // can handle navigation (including the debounce guard).
      this.triggerEvent('tap', { id });
    },
  },
});
