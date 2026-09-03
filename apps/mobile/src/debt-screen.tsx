import { useT } from "@waltning/ui/i18n/provider";
import { GroundPanel } from "@waltning/ui/shell/card";
import { EmptyState } from "@waltning/ui/states/empty-state";
import { router } from "expo-router";
import { useMemo } from "react";

function handleGoToToday() {
  router.push("/");
}

/** S12's stub, until E's arc builds the real debt and counterparties screen. */
export default function DebtStub() {
  const t = useT();
  const primaryAction = useMemo(
    () => ({ label: t("states.stub.goToToday"), onPress: handleGoToToday }),
    [t],
  );

  return (
    <GroundPanel>
      <EmptyState
        variant="range"
        title={t("routes.debt")}
        body={t("states.stub.body")}
        primaryAction={primaryAction}
      />
    </GroundPanel>
  );
}
