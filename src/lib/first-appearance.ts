export class FirstAppearanceTracker {
  private animated = new Set<string>();
  private discovered = new Set<string>();

  beginScan() {
    this.animated.clear();
    this.discovered.clear();
  }

  restore(urls: Iterable<string>) {
    for (const url of urls) {
      this.discovered.add(url);
      this.animated.add(url);
    }
  }

  discover(url: string) {
    const isNew = !this.discovered.has(url);
    this.discovered.add(url);
    return isNew;
  }

  shouldAnimate(url: string) {
    return this.discovered.has(url) && !this.animated.has(url);
  }

  markAnimated(url: string) {
    this.animated.add(url);
  }
}
