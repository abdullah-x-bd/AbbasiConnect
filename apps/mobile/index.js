// Install native WebCrypto before importing any application code.
import { install } from "react-native-quick-crypto";
install();
const { registerRootComponent } = require("expo");
registerRootComponent(require("./src/App").default);
