export class Memory {
  private store: Record<string, any> = {};

  set(key: string, value: any) {
    this.store[key] = value;
  }

  get(key: string): any {
    return this.store[key];
  }

  getAll(): Record<string, any> {
    return { ...this.store };
  }
}
