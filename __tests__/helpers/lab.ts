import { setLabOwner, useLab } from "@kiungo/lab/store";

/** A clean lab for one test: signed in as `account`, with nothing saved. */
export function freshLab(account = "acct-test") {
  setLabOwner(null);
  window.localStorage.clear();
  setLabOwner(account);
  useLab.setState({ hydrated: false, sessions: [], activeId: null, past: [], future: [], saveError: false });
}
