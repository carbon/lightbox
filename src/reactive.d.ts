declare module Carbon {
  export class Reactive {
    on(type: String, callback: Function): void;
    trigger(event: any): void;
  }
}