import { Router } from "express";
import { ExportController } from "../controllers/export.controller";

const router = Router();
const controller = new ExportController();

router.post("/", controller.exportClaims.bind(controller));

export default router;
