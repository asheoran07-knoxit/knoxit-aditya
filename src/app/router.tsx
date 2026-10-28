import { Route, Switch } from "wouter";
import { AppShell } from "./AppShell";
import { ProtectedRoute } from "../features/auth/ProtectedRoute";
import Login from "../features/auth/pages/Login";
import Signup from "../features/auth/pages/Signup";
import ForgotPassword from "../features/auth/pages/ForgotPassword";
import Home from "../pages/Home";
import MyLeagues from "../pages/MyLeagues";
import Picks from "../pages/Picks";
import PickSubmission from "../pages/PickSubmission";
import Predict from "../pages/Predict";
import Fixtures from "../pages/Fixtures";
import Shop from "../pages/Shop";
import Profile from "../pages/menu/Profile";
import NotificationSettings from "../pages/menu/NotificationSettings";
import ReferAndEarn from "../pages/menu/ReferAndEarn";
import InviteFriends from "../pages/menu/InviteFriends";
import SignOut from "../pages/menu/SignOut";
import { About, ContactSupport, FAQ, HowToPlay, PrivacyPolicy, TermsAndConditions } from "../pages/menu/StaticPages";
import LeagueDetail from "../pages/LeagueDetail";
import OpponentProfile from "../pages/OpponentProfile";
import ExploreLeagues from "../pages/ExploreLeagues";
import { FriendsLeagueRequestDetail, PublicFriendsLeaguesList } from "../pages/FriendsLeagues";
import JoinByCode from "../pages/JoinByCode";
import PublicJoin from "../pages/PublicJoin";
import CreateFriendsLeague from "../pages/CreateFriendsLeague";
import ManageAdmins from "../pages/ManageAdmins";
import ManageRequests from "../pages/ManageRequests";
import Operations from "../pages/Operations";

export function AppRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/join/:inviteCode" component={PublicJoin} />
        <Route path="/join" component={PublicJoin} />
        <ProtectedRoute path="/" component={Home} />
        <ProtectedRoute path="/my-leagues" component={MyLeagues} />
        <ProtectedRoute path="/picks" component={Picks} />
        <ProtectedRoute path="/picks/submit/:leagueId" component={PickSubmission} />
        <ProtectedRoute path="/predict/:leagueId" component={Predict} />
        <ProtectedRoute path="/fixtures" component={Fixtures} />
        <ProtectedRoute path="/shop" component={Shop} />
        <ProtectedRoute path="/menu/profile" component={Profile} />
        <ProtectedRoute path="/menu/notifications" component={NotificationSettings} />
        <ProtectedRoute path="/menu/refer" component={ReferAndEarn} />
        <ProtectedRoute path="/menu/invite" component={InviteFriends} />
        <ProtectedRoute path="/menu/sign-out" component={SignOut} />
        <ProtectedRoute path="/menu/how-to-play" component={HowToPlay} />
        <ProtectedRoute path="/menu/faq" component={FAQ} />
        <ProtectedRoute path="/menu/terms" component={TermsAndConditions} />
        <ProtectedRoute path="/menu/privacy" component={PrivacyPolicy} />
        <ProtectedRoute path="/menu/support" component={ContactSupport} />
        <ProtectedRoute path="/menu/about" component={About} />
        <ProtectedRoute path="/leagues/explore" component={ExploreLeagues} />
        <ProtectedRoute path="/leagues/:id" component={LeagueDetail} />
        <ProtectedRoute path="/leagues/:leagueId/opponent/:userId" component={OpponentProfile} />
        <ProtectedRoute path="/friends-leagues" component={PublicFriendsLeaguesList} />
        <ProtectedRoute path="/friends-leagues/requests" component={ManageRequests} />
        <ProtectedRoute path="/friends-leagues/join-by-code" component={JoinByCode} />
        <ProtectedRoute path="/friends-leagues/create" component={CreateFriendsLeague} />
        <ProtectedRoute path="/leagues/:id/manage-admins" component={ManageAdmins} />
        <ProtectedRoute path="/friends-leagues/:id" component={FriendsLeagueRequestDetail} />
        <ProtectedRoute path="/operations" component={Operations} />
        <Route>
          <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">Not found</div>
        </Route>
      </Switch>
    </AppShell>
  );
}
