export interface NavigationCheckpoint { readonly isCurrent: () => boolean }

/** The shell owns navigation. Pending intents supersede routes, but only a committed
 * destination invalidates the surviving page's reads (a refused leave keeps it usable). */
export class NavigationGeneration {
  private intent = 0;
  private page = 0;

  begin(): NavigationCheckpoint {
    this.intent += 1;
    return this.route();
  }

  route(): NavigationCheckpoint {
    const intent = this.intent;
    return { isCurrent: () => intent === this.intent };
  }

  commit(): void {
    this.intent += 1;
    this.page += 1;
  }

  read(root: HTMLElement): NavigationCheckpoint {
    const page = this.page;
    return { isCurrent: () => page === this.page && root.isConnected };
  }
}

export const navigation = new NavigationGeneration();
