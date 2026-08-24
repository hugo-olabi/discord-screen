import { Route } from '@solidjs/router';
import Home from './pages/Home';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import DiscordInstall from './pages/DiscordInstall';

export default function App() {
  return (
    <>
      <Route path="/" component={Home} />
      <Route path="/room/:token" component={Home} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/discord" component={DiscordInstall} />
    </>
  );
}
