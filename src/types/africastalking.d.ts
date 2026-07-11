declare module "africastalking" {
  interface SmsOptions {
    to: string[];
    message: string;
    senderId?: string;
  }

  interface AfricaTalkingClient {
    SMS: {
      send(options: SmsOptions): Promise<unknown>;
    };
  }

  export default function AfricasTalking(credentials: {
    apiKey: string;
    username: string;
  }): AfricaTalkingClient;
}
