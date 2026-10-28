import type { ComponentType } from "react";
import { Redirect, Route, type RouteComponentProps } from "wouter";
import { useAppSelector } from "../../app/hooks";
import { AuthedLayout } from "../../app/AuthedLayout";

type Props<T extends Record<string, string> = Record<string, string>> = {
  path: string;
  component: ComponentType<RouteComponentProps<T>> | ComponentType<any>;
};

export function ProtectedRoute<T extends Record<string, string>>({ path, component: Component }: Props<T>) {
  const status = useAppSelector((state) => state.auth.status);

  return (
    <Route path={path}>
      {(params) => {
        if (status === "loading") {
          return <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Loading session...</div>;
        }

        if (status === "guest") {
          return <Redirect to="/login" />;
        }

        return (
          <AuthedLayout>
            <Component params={params as T} />
          </AuthedLayout>
        );
      }}
    </Route>
  );
}
