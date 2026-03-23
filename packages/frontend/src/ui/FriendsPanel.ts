const FAKE_FRIENDS = ['Mochi', 'Biscuit', 'Pepper'];

/** Small friends list panel — opens/closes on friends badge click. */
export class FriendsPanel {
  readonly el: HTMLDivElement;
  private visible = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'friends-panel';
    this.el.className = 'ui-panel';
    this.el.hidden = true;

    const header = document.createElement('div');
    header.className = 'friends-header';
    header.textContent = 'Friends';

    const list = document.createElement('ul');
    list.className = 'friends-list';

    for (const name of FAKE_FRIENDS) {
      const li = document.createElement('li');
      li.className = 'friend-item';

      const dot = document.createElement('span');
      dot.className = 'friend-dot';

      const label = document.createElement('span');
      label.textContent = name;

      li.append(dot, label);
      list.appendChild(li);
    }

    this.el.append(header, list);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
  }

  close(): void {
    this.visible = false;
    this.el.hidden = true;
  }
}
