/**
 * `<RenderFailed>` — what replaces a screen whose render threw
 * (`design-system/08` §8.2, `architecture/11` §8c).
 *
 * A render error used to unmount the whole tree and leave the window's own
 * white. It is a `recoverable` `<ErrorState>` instead: a sentence that says
 * what happened and that the ledger is untouched, and **Try again**, which the
 * boundary answers by mounting the route afresh. The error itself is not
 * drawn — it is a developer's sentence — it goes to Diagnostics.
 */

import { View } from "react-native";
import { useT } from "../../../i18n/provider";
import { GroundPanel } from "../../../shell/molecules/card/card";
import { makeStyles } from "../../../theme/styles.ts";
import { ErrorState } from "../error-state/error-state";

export type RenderFailedProps = {
  onRetry: () => void;
};

export function RenderFailed({ onRetry }: RenderFailedProps) {
  const t = useT();
  const styles = useStyles();
  return (
    <GroundPanel>
      <View style={styles.center}>
        <ErrorState
          variant="recoverable"
          what={t("startup.renderFailedTitle")}
          why={t("startup.renderFailedBody")}
          action={{ label: t("common.retry"), onPress: onRetry }}
        />
      </View>
    </GroundPanel>
  );
}

const useStyles = makeStyles(() => ({
  center: { flexGrow: 1, justifyContent: "center" },
}));
