"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const consola_1 = __importDefault(require("consola"));
const port = process.env.PORT || 5000;
app_1.default.listen(port, () => {
    consola_1.default.success(`Listening: http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map