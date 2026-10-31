export interface View {
  /** Used in the address, e.g. #invoice. */
  id: string;
  /** Short name for the tab. */
  title: string;
  heading: string;
  description: string;
  mount(container: HTMLElement): void;
  /** Called each time the view is shown, to show the latest data. */
  show?(): void;
}
