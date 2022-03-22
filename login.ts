import { sendCode } from "mtproto/auth/user.ts";
import { Confirm, Input, Secret } from "cliffy/prompt/mod.ts";
import proto from "./impl/client.ts";

try {
  await proto.init();

  await sendCode(proto, {
    async askCode() {
      return await Input.prompt("Phone code");
    },
    async askPassword(hint) {
      return await Secret.prompt(
        "2FA Password" + (hint ? `(hint: ${hint})` : ""),
      );
    },
    async askSignUp() {
      if (await Confirm.prompt("Sign up")) {
        const first_name = await Input.prompt("First name");
        const last_name = await Input.prompt("Last name");
        return { first_name, last_name };
      }
    },
  }, await Input.prompt("Phone number"));
} finally {
  await proto.shutdown();
}
