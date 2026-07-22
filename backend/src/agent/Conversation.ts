import { Message } from '../types';

export class Conversation {
  private messages: Message[] = [];

  constructor(initialMessages: Message[] = []) {
    this.messages = [...initialMessages];
  }

  addMessage(message: Message) {
    this.messages.push(message);
  }

  getMessages(): Message[] {
    return [...this.messages];
  }
}
