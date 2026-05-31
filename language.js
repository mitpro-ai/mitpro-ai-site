(function () {
  const translations = {
    "Home": "होम",
    "Mission": "मिशन",
    "Features": "फीचर्स",
    "Pricing": "प्राइसिंग",
    "Risk": "जोखिम",
    "Privacy": "प्राइवेसी",
    "Terms": "शर्तें",
    "Contact": "संपर्क",
    "Login": "लॉगिन",
    "English": "English",
    "Hindi": "हिंदी",
    "Intelligence Terminal": "इंटेलिजेंस टर्मिनल",
    "Market Intelligence Terminal": "मार्केट इंटेलिजेंस टर्मिनल",
    "MIT PRO Command Center": "MIT PRO कमांड सेंटर",
    "Understand The Market Before You Approach It": "बाजार के पास जाने से पहले उसे समझें",
    "Intelligence • Protection • Discipline": "इंटेलिजेंस • सुरक्षा • अनुशासन",
    "Desktop Intelligence Terminal": "डेस्कटॉप इंटेलिजेंस टर्मिनल",
    "MIT Pro combines Zeus Intelligence and Arjun Defense to help users understand market conditions with better awareness, discipline, and control.": "MIT Pro Zeus Intelligence और Arjun Defense को जोड़कर उपयोगकर्ताओं को अधिक जागरूकता, अनुशासन और नियंत्रण के साथ बाजार स्थितियों को समझने में मदद करता है।",
    "Zeus Analysis": "Zeus विश्लेषण",
    "Arjun Protection": "Arjun सुरक्षा",
    "Apex Core Running": "Apex Core सक्रिय",
    "Decision Support Only": "केवल निर्णय सहायता",
    "No Guaranteed Results": "किसी परिणाम की गारंटी नहीं",
    "Enter Terminal": "टर्मिनल देखें",
    "Request License": "लाइसेंस अनुरोध",
    "Read Risk Disclaimer": "जोखिम अस्वीकरण पढ़ें",
    "MIT PRO Features": "MIT PRO फीचर्स",
    "Powerful Intelligence. Human-Centered Protection.": "शक्तिशाली इंटेलिजेंस। मानव-केंद्रित सुरक्षा।",
    "MIT Pro is designed to help users better understand market behavior through adaptive intelligence, risk awareness, educational insights, and human-layer protection.": "MIT Pro अनुकूल इंटेलिजेंस, जोखिम जागरूकता, शैक्षिक जानकारी और मानव-स्तर सुरक्षा के माध्यम से उपयोगकर्ताओं को बाजार व्यवहार बेहतर समझने में मदद करने के लिए बनाया गया है।",
    "Zeus Intelligence": "Zeus इंटेलिजेंस",
    "Zeus Intelligence Core": "Zeus इंटेलिजेंस कोर",
    "Intelligence Active": "इंटेलिजेंस सक्रिय",
    "Neural Activity Active": "न्यूरल गतिविधि सक्रिय",
    "Analyzes market behavior, structure, momentum, volatility, liquidity, and confidence conditions in real time.": "वास्तविक समय में बाजार व्यवहार, संरचना, गति, अस्थिरता, लिक्विडिटी और कॉन्फिडेंस स्थितियों का विश्लेषण करता है।",
    "Arjun Defense": "Arjun डिफेंस",
    "Arjun Protection System": "Arjun सुरक्षा प्रणाली",
    "Protection Active": "सुरक्षा सक्रिय",
    "Protection Integrity 100%": "सुरक्षा अखंडता 100%",
    "Promotes discipline, awareness, session health, cooldown protection, and responsible decision-making.": "अनुशासन, जागरूकता, सेशन स्वास्थ्य, कूलडाउन सुरक्षा और जिम्मेदार निर्णय लेने को बढ़ावा देता है।",
    "MIT PRO Decision Support": "MIT PRO निर्णय सहायता",
    "Zeus AI Intelligence Engine": "Zeus AI इंटेलिजेंस इंजन",
    "Adaptive market analysis": "अनुकूल बाजार विश्लेषण",
    "Market state recognition": "बाजार स्थिति पहचान",
    "Confidence evaluation": "कॉन्फिडेंस मूल्यांकन",
    "Behavioral pattern recognition": "व्यवहार पैटर्न पहचान",
    "Volatility assessment": "अस्थिरता मूल्यांकन",
    "Liquidity monitoring": "लिक्विडिटी निगरानी",
    "Risk awareness monitoring": "जोखिम जागरूकता निगरानी",
    "Discipline protection": "अनुशासन सुरक्षा",
    "Emotional decision detection": "भावनात्मक निर्णय पहचान",
    "Session health monitoring": "सेशन स्वास्थ्य निगरानी",
    "Cooldown protection": "कूलडाउन सुरक्षा",
    "Behavioral alerts": "व्यवहार अलर्ट",
    "Live Intelligence Desk": "लाइव इंटेलिजेंस डेस्क",
    "Live market status": "लाइव बाजार स्थिति",
    "Market stability indicator": "बाजार स्थिरता संकेतक",
    "Confidence dashboard": "कॉन्फिडेंस डैशबोर्ड",
    "Risk assessment overview": "जोखिम मूल्यांकन अवलोकन",
    "Session intelligence feed": "सेशन इंटेलिजेंस फीड",
    "Adaptive intelligence updates": "अनुकूल इंटेलिजेंस अपडेट",
    "Liquidity Intelligence": "लिक्विडिटी इंटेलिजेंस",
    "Liquidity zone identification": "लिक्विडिटी ज़ोन पहचान",
    "Market pressure monitoring": "बाजार दबाव निगरानी",
    "Structure awareness": "संरचना जागरूकता",
    "Market balance analysis": "बाजार संतुलन विश्लेषण",
    "Dynamic liquidity mapping": "डायनामिक लिक्विडिटी मैपिंग",
    "Market State Detection": "बाजार स्थिति पहचान",
    "Stable environment": "स्थिर वातावरण",
    "Expansion phase": "विस्तार चरण",
    "Consolidation phase": "कंसोलिडेशन चरण",
    "Transitional phase": "ट्रांजिशन चरण",
    "Volatile conditions": "अस्थिर स्थितियां",
    "Uncertain environment": "अनिश्चित वातावरण",
    "Confidence Framework": "कॉन्फिडेंस फ्रेमवर्क",
    "Improved transparency": "बेहतर पारदर्शिता",
    "Additional context": "अतिरिक्त संदर्भ",
    "Enhanced awareness": "बेहतर जागरूकता",
    "Better decision support": "बेहतर निर्णय सहायता",
    "Confidence-based validation": "कॉन्फिडेंस आधारित वैलिडेशन",
    "Adaptive Intelligence": "अनुकूल इंटेलिजेंस",
    "Dynamic condition recognition": "डायनामिक स्थिति पहचान",
    "Behavioral adaptation": "व्यवहारिक अनुकूलन",
    "Context-aware analysis": "संदर्भ आधारित विश्लेषण",
    "Continuous intelligence evolution": "लगातार इंटेलिजेंस विकास",
    "Educational Intelligence": "शैक्षिक इंटेलिजेंस",
    "Contextual insights": "संदर्भ आधारित जानकारी",
    "Market behavior explanations": "बाजार व्यवहार की व्याख्या",
    "Risk awareness guidance": "जोखिम जागरूकता मार्गदर्शन",
    "Learning-oriented intelligence": "सीखने केंद्रित इंटेलिजेंस",
    "Decision context support": "निर्णय संदर्भ सहायता",
    "Security and Privacy": "सुरक्षा और प्राइवेसी",
    "Secure user authentication": "सुरक्षित उपयोगकर्ता प्रमाणीकरण",
    "License protection system": "लाइसेंस सुरक्षा प्रणाली",
    "Account security controls": "अकाउंट सुरक्षा नियंत्रण",
    "Privacy-focused design": "प्राइवेसी केंद्रित डिजाइन",
    "Secure platform access": "सुरक्षित प्लेटफॉर्म एक्सेस",
    "Why MIT PRO": "MIT PRO क्यों",
    "Adaptive intelligence": "अनुकूल इंटेलिजेंस",
    "Human-centered protection": "मानव-केंद्रित सुरक्षा",
    "Real-time market awareness": "रीयल-टाइम बाजार जागरूकता",
    "Educational insights": "शैक्षिक जानकारी",
    "Discipline-focused design": "अनुशासन केंद्रित डिजाइन",
    "Continuous innovation": "लगातार नवाचार",
    "Security and reliability": "सुरक्षा और विश्वसनीयता",
    "Liquidity Battlefield": "लिक्विडिटी बैटलफील्ड",
    "Liquidity Battlefield Engine": "लिक्विडिटी बैटलफील्ड इंजन",
    "A real product-inspired view of how MIT PRO explains zones, pressure, volatility, and session context inside the terminal.": "टर्मिनल के अंदर ज़ोन, दबाव, अस्थिरता और सेशन संदर्भ को MIT PRO कैसे समझाता है, इसका वास्तविक उत्पाद-प्रेरित दृश्य।",
    "MIT PRO Preview": "MIT PRO प्रीव्यू",
    "Market Story": "बाजार कहानी",
    "Observation Mode": "ऑब्जर्वेशन मोड",
    "Conditions are being mapped before validation.": "वैलिडेशन से पहले स्थितियों को मैप किया जा रहा है।",
    "Watched Zone": "निगरानी ज़ोन",
    "Timeframe Context": "टाइमफ्रेम संदर्भ",
    "Higher timeframe awareness is preferred.": "उच्च टाइमफ्रेम जागरूकता को प्राथमिकता दी जाती है।",
    "User State": "उपयोगकर्ता स्थिति",
    "Observe": "ऑब्जर्व",
    "Decision support remains educational.": "निर्णय सहायता शैक्षिक रहती है।",
    "Live Desk Preview": "लाइव डेस्क प्रीव्यू",
    "MIT PRO Live Desk Preview": "MIT PRO लाइव डेस्क प्रीव्यू",
    "The operating cockpit where Zeus readings, Arjun protection, timing awareness, and session discipline stay visible together.": "वह ऑपरेटिंग कॉकपिट जहां Zeus readings, Arjun सुरक्षा, टाइमिंग जागरूकता और सेशन अनुशासन साथ में दिखाई देते हैं।",
    "Market Reading": "बाजार रीडिंग",
    "Structure and pressure context stay visible.": "संरचना और दबाव संदर्भ दिखाई देता रहता है।",
    "Active Guard": "सक्रिय गार्ड",
    "Session discipline remains protected.": "सेशन अनुशासन सुरक्षित रहता है।",
    "Tactical Intelligence": "टैक्टिकल इंटेलिजेंस",
    "Command Access Levels": "कमांड एक्सेस स्तर",
    "Guardian, Commander, Supreme": "Guardian, Commander, Supreme",
    "Access levels stay consistent from the command-center entrance to the license activation chamber.": "एक्सेस स्तर कमांड सेंटर प्रवेश से लाइसेंस एक्टिवेशन तक एक जैसे रहते हैं।",
    "Foundation command": "फाउंडेशन कमांड",
    "Guardian Access": "Guardian एक्सेस",
    "For learning, awareness, and basic protection.": "सीखने, जागरूकता और बेसिक सुरक्षा के लिए।",
    "REAL mode": "REAL मोड",
    "Core strategies": "कोर रणनीतियां",
    "Basic guard": "बेसिक गार्ड",
    "View Guardian": "Guardian देखें",
    "Most Popular": "सबसे लोकप्रिय",
    "Commander Access": "Commander एक्सेस",
    "Complete MIT Pro experience for active users.": "सक्रिय उपयोगकर्ताओं के लिए पूरा MIT Pro अनुभव।",
    "Advanced tools": "एडवांस टूल्स",
    "Timing sync": "टाइमिंग सिंक",
    "Full discipline guard": "पूर्ण अनुशासन गार्ड",
    "View Commander": "Commander देखें",
    "Full command": "पूर्ण कमांड",
    "Supreme Access": "Supreme एक्सेस",
    "Full command center access and advanced coverage.": "पूर्ण कमांड सेंटर एक्सेस और एडवांस कवरेज।",
    "Advanced OTC suite": "एडवांस OTC सूट",
    "Full battlefield": "पूर्ण बैटलफील्ड",
    "Future priority access": "भविष्य प्राथमिकता एक्सेस",
    "View Supreme": "Supreme देखें",
    "MIT PRO Mission": "MIT PRO मिशन",
    "Knowledge Before Action. Protection Before Emotion.": "कार्रवाई से पहले ज्ञान। भावना से पहले सुरक्षा।",
    "At MIT PRO, Market Intelligence Terminal, our mission is to help individuals make smarter, calmer, and more informed decisions by transforming complex market behavior into understandable intelligence.": "MIT PRO, Market Intelligence Terminal में हमारा मिशन जटिल बाजार व्यवहार को समझने योग्य इंटेलिजेंस में बदलकर लोगों को अधिक समझदार, शांत और जागरूक निर्णय लेने में मदद करना है।",
    "Our Mission": "हमारा मिशन",
    "Adaptive intelligence built for awareness, not impulse.": "जागरूकता के लिए बनी अनुकूल इंटेलिजेंस, आवेग के लिए नहीं।",
    "The MIT PRO Promise": "MIT PRO वादा",
    "We do not promise outcomes.": "हम परिणामों का वादा नहीं करते।",
    "We do not promote shortcuts.": "हम शॉर्टकट को बढ़ावा नहीं देते।",
    "We do not encourage blind decisions.": "हम अंधे निर्णयों को प्रोत्साहित नहीं करते।",
    "Understand": "समझें",
    "Market behavior translated into clear intelligence.": "बाजार व्यवहार को स्पष्ट इंटेलिजेंस में बदला गया।",
    "Recognize Risk": "जोखिम पहचानें",
    "Conditions, pressure, and uncertainty shown before action.": "कार्रवाई से पहले स्थितियां, दबाव और अनिश्चितता दिखाई जाती है।",
    "Stay Disciplined": "अनुशासित रहें",
    "A focused workspace designed for calmer decisions.": "शांत निर्णयों के लिए बनाया गया केंद्रित वर्कस्पेस।",
    "Why We Exist": "हम क्यों हैं",
    "Protection First": "सुरक्षा पहले",
    "Education Over Emotion": "भावना से पहले शिक्षा",
    "Human Intelligence + AI": "मानव इंटेलिजेंस + AI",
    "Transparency and Responsibility": "पारदर्शिता और जिम्मेदारी",
    "Continuous Improvement": "लगातार सुधार",
    "Our Vision": "हमारा विजन",
    "Commitment": "प्रतिबद्धता",
    "User Awareness First": "उपयोगकर्ता जागरूकता पहले",
    "Discipline Before Action": "कार्रवाई से पहले अनुशासन",
    "Protection Before Exposure": "एक्सपोजर से पहले सुरक्षा",
    "Intelligence Before Decision": "निर्णय से पहले इंटेलिजेंस",
    "MIT PRO License Access": "MIT PRO लाइसेंस एक्सेस",
    "MIT Pro Partner Portal": "MIT Pro पार्टनर पोर्टल",
    "AI sales intelligence, referral follow-up, and license care": "AI sales intelligence, referral follow-up और license care",
    "Protected partner access": "सुरक्षित पार्टनर एक्सेस",
    "Sales Workspace": "सेल्स वर्कस्पेस",
    "Sign in to review referrals, customer follow-up, and license expiry without opening trading controls.": "ट्रेडिंग कंट्रोल खोले बिना referrals, customer follow-up और license expiry देखने के लिए साइन इन करें।",
    "Unlock Partner Portal": "पार्टनर पोर्टल अनलॉक करें",
    "Open Terminal": "टर्मिनल खोलें",
    "Logout": "लॉगआउट",
    "Activate Your MIT PRO Access": "अपना MIT PRO एक्सेस एक्टिव करें",
    "Start with the license level that matches your market coverage, protection needs, and discipline workflow. Manual USDT confirmation is active until Stripe payment is available.": "अपने बाजार कवरेज, सुरक्षा जरूरतों और अनुशासन वर्कफ्लो के अनुसार लाइसेंस स्तर से शुरू करें। Stripe उपलब्ध होने तक मैनुअल USDT पुष्टि सक्रिय है।",
    "Compare Plans": "प्लान तुलना करें",
    "Payment Safety": "पेमेंट सुरक्षा",
    "MIT PRO will never ask for your wallet seed phrase, private key, remote wallet access, or exchange login. Send payment only after confirming the official wallet details with MIT PRO support.": "MIT PRO कभी भी आपका wallet seed phrase, private key, remote wallet access या exchange login नहीं मांगेगा। आधिकारिक wallet details MIT PRO support से पुष्टि करने के बाद ही payment भेजें।",
    "Never Share": "कभी साझा न करें",
    "Seed Phrase": "Seed Phrase",
    "Private Key": "Private Key",
    "Remote Access": "Remote Access",
    "Exchange Password": "Exchange Password",
    "OTP Codes": "OTP Codes",
    "Screen Sharing Requests": "Screen Sharing Requests",
    "Risk Disclaimer": "जोखिम अस्वीकरण",
    "Protection First": "सुरक्षा पहले",
    "Trading Risk": "ट्रेडिंग जोखिम",
    "No Financial Advice": "कोई वित्तीय सलाह नहीं",
    "No Profit Guarantee": "लाभ की कोई गारंटी नहीं",
    "No Trade Execution": "कोई ट्रेड निष्पादन नहीं",
    "Not a Broker or Adviser": "ब्रोकर या सलाहकार नहीं",
    "Market Uncertainty": "बाजार अनिश्चितता",
    "High-Risk Instruments": "उच्च जोखिम उपकरण",
    "User Responsibility": "उपयोगकर्ता जिम्मेदारी",
    "Past Performance": "पिछला प्रदर्शन",
    "No Liability": "कोई दायित्व नहीं",
    "Privacy Policy": "प्राइवेसी पॉलिसी",
    "Terms of Use": "उपयोग की शर्तें",
    "Contact MIT PRO": "MIT PRO से संपर्क करें",
    "MIT PRO Support Channel": "MIT PRO सपोर्ट चैनल",
    "Support Desk": "सपोर्ट डेस्क",
    "MIT PRO Support Gateway": "MIT PRO सपोर्ट गेटवे",
    "Send Request": "अनुरोध भेजें",
    "Support Request": "सपोर्ट अनुरोध",
    "Your name": "आपका नाम",
    "Your email": "आपका ईमेल",
    "Subject": "विषय",
    "Message": "संदेश",
    "Send Support Request": "सपोर्ट अनुरोध भेजें",
    "Human Review": "मानव समीक्षा",
    "License Support": "लाइसेंस सपोर्ट",
    "MIT PRO is not financial advice and does not guarantee trading results.": "MIT PRO वित्तीय सलाह नहीं है और ट्रेडिंग परिणामों की गारंटी नहीं देता।",
    "© 2026 MIT PRO. All rights reserved.": "© 2026 MIT PRO. सर्वाधिकार सुरक्षित।"
  };

  const originals = new WeakMap();
  const ignoredTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "PATH", "SYMBOL"]);

  function translateText(text, language) {
    if (language === "en") return text;
    const trimmed = text.trim();
    if (!trimmed) return text;
    const translated = translations[trimmed];
    if (!translated) return text;
    return text.replace(trimmed, translated);
  }

  function applyLanguage(language) {
    document.documentElement.lang = language === "hi" ? "hi" : "en";
    document.body.classList.toggle("lang-hi", language === "hi");

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || ignoredTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(".language-switch")) return NodeFilter.FILTER_REJECT;
        if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (!originals.has(node)) originals.set(node, node.textContent);
      node.textContent = translateText(originals.get(node), language);
    });

    document.querySelectorAll("[placeholder]").forEach((field) => {
      if (!field.dataset.originalPlaceholder) field.dataset.originalPlaceholder = field.getAttribute("placeholder") || "";
      field.setAttribute("placeholder", translateText(field.dataset.originalPlaceholder, language));
    });

    document.querySelectorAll("[data-language]").forEach((button) => {
      const active = button.dataset.language === language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function initLanguageSwitch() {
    const saved = localStorage.getItem("mitpro-language") || "en";
    document.querySelectorAll("[data-language]").forEach((button) => {
      button.addEventListener("click", () => {
        const language = button.dataset.language === "hi" ? "hi" : "en";
        localStorage.setItem("mitpro-language", language);
        applyLanguage(language);
      });
    });
    applyLanguage(saved === "hi" ? "hi" : "en");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLanguageSwitch);
  } else {
    initLanguageSwitch();
  }
})();
