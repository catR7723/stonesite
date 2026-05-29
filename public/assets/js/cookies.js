



silktideCookieBannerManager.updateCookieBannerConfig({
  background: {
    showBackground: true
  },
  cookieIcon: {
    position: "bottomLeft"
  },
  cookieTypes: [
    {
      id: "necessari_necessary",
      name: "NECESSARI, Necessary",
      description: "<p>Questi cookies sono necessari per il corretto funzionamento del sito web e non possono essere disattivati. Aiutano in attività come l'accesso e la definizione delle preferenze sulla privacy.</p><p><span style=\"font-size: 1rem; letter-spacing: 0.02rem;\">These cookies are necessary for the website to function properly and cannot be switched off. They help with things like logging in and setting your privacy preferences.</span></p>",
      required: true,
      onAccept: function() {
        console.log('Add logic for the required NECESSARI, Necessary here');
      }
    },
    {
      id: "analitici_analytics",
      name: "ANALITICI, Analytics",
      description: "<p>Questi cookies ci aiutano a migliorare il sito monitorando quali pagine sono più popolari e come i visitatori navigano al suo interno</p><p>These cookies help us improve the site by tracking which pages are most popular and how visitors move around the site.</p>",
      required: false,
      onAccept: function() {
        gtag('consent', 'update', {
          analytics_storage: 'granted',
        });
        dataLayer.push({
          'event': 'consent_accepted_analitici_analytics',
        });
      },
      onReject: function() {
        gtag('consent', 'update', {
          analytics_storage: 'denied',
        });
      }
    },
    {
      id: "pubblicitari_advertising",
      name: "PUBBLICITARI, Advertising",
      description: "<p>Questi cookies offrono funzionalità aggiuntive e personalizzazione per migliorare la tua esperienza. Possono essere impostati da noi o da patners di cui utilizziamo i servizi.</p><p>These cookies provide extra features and personalization to improve your experience. They may be set by us or by partners whose services we use.</p>",
      required: false,
      onAccept: function() {
        gtag('consent', 'update', {
          ad_storage: 'granted',
          ad_user_data: 'granted',
          ad_personalization: 'granted',
        });
        dataLayer.push({
          'event': 'consent_accepted_pubblicitari_advertising',
        });
      },
      onReject: function() {
        gtag('consent', 'update', {
          ad_storage: 'denied',
          ad_user_data: 'denied',
          ad_personalization: 'denied',
        });
      }
    }
  ],
  text: {
    banner: {
      description: "<p>Utilizziamo cookies sul nostro sito per migliorare la tua esperienza, fornire contenuti personalizzati e analizzare il nostro traffico.</p><p>We use cookies on our site to enhance your user experience, provide personalized content, and analyze our traffic. <a href=\"https://www.iubenda.com/privacy-policy/44804857/cookie-policy\" target=\"_blank\">Cookie Policy.</a></p>",
      acceptAllButtonText: "Accetta tutti, Accept all",
      acceptAllButtonAccessibleLabel: "Accept all cookies",
      rejectNonEssentialButtonText: "Rifiuta i non essenziali, Reject non-essential",
      rejectNonEssentialButtonAccessibleLabel: "Reject non-essential",
      preferencesButtonText: "Preferenze,Preferences",
      preferencesButtonAccessibleLabel: ""
    },
    preferences: {
      title: "Personalizza le Tue Preferenze per i cookie, Customize your cookie preferences",
      description: "<p>Rispettiamo il tuo diritto alla privacy. Puoi scegliere di non consentire alcuni tipi di cookies. Letue preferenze saranno applicate a tutto il nostro sito web</p><p>We respect your right to privacy. You can choose not to allow some types of cookies. Your cookie preferences will apply across our website.</p>",
      creditLinkText: "",
      creditLinkAccessibleLabel: ""
    }
  },
  position: {
    banner: "bottomLeft"
  }
});


