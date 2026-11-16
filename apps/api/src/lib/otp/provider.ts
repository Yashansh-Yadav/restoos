// OTP delivery behind one interface (plan M1-T1). The console adapter is for development and
// tests only — env validation refuses OTP_PROVIDER=console in production. A real SMS adapter
// (e.g. MSG91 with DLT-registered templates) is added once the provider is chosen (plan §18).

export interface OtpProvider {
  readonly name: string;
  send(phoneNumber: string, code: string): Promise<void>;
}

type Log = { info: (obj: object, msg: string) => void };

/** Prints OTPs to the log and remembers the latest per number (read by tests / the dev hook). */
export class ConsoleOtpProvider implements OtpProvider {
  readonly name = "console";
  private readonly last = new Map<string, string>();

  constructor(private readonly log?: Log) {}

  send(phoneNumber: string, code: string): Promise<void> {
    this.last.set(phoneNumber, code);
    // Dev only: the code is printed on purpose so you can sign in locally.
    if (this.log)
      this.log.info({ otpPhone: phoneNumber, otpCode: code }, "DEV OTP (console provider)");
    else console.log(`[otp] DEV code for ${phoneNumber}: ${code}`);
    return Promise.resolve();
  }

  lastCode(phoneNumber: string): string | undefined {
    return this.last.get(phoneNumber);
  }
}
