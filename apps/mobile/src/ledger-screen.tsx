import { useT } from "@waltning/ui/i18n/provider";
import { GroundPanel } from "@waltning/ui/shell/card";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { router } from "expo-router";
import { useMemo } from "react";

function handleGoToToday() {
  router.push("/");
}

/**
 * S10's stub, until C4 builds the real transactions list. `variant="range"`
 * per the plan — not a perfect semantic fit (nothing is out of period; the
 * screen itself is not built) but the one the phone-alone preview names, and
 * the closest of the three to "there is nothing here for you yet".
 */
export default function Ledger() {
  const t = useT();
  const primaryAction = useMemo(
    () => ({ label: t("states.stub.goToToday"), onPress: handleGoToToday }),
    [t],
  );

  return (
    <GroundPanel>
      <EmptyState
        variant="range"
        title={t("routes.ledger")}
        body={t("states.stub.body")}
        primaryAction={primaryAction}
      />
    </GroundPanel>
  );
}
