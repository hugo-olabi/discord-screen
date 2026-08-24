import { Route } from '@solidjs/router';
import Home from './pages/Home.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import TermsOfService from './pages/TermsOfService.jsx';

export default function App() {
  return (
    <>
      <Route path="/" component={Home} />
      <Route path="/room/:token" component={Home} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
    </>
  );
}
