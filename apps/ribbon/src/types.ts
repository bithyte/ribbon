/** What commander parses for `ribbon install`; `yes` is omitted when the flag isn't given. */
export type InstallCommandOptions = {
  readonly yes?: boolean;
};
