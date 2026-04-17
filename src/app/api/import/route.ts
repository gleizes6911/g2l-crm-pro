import { ImportPayloadSchema } from "@/lib/validations/fleet";
import { FleetService, FleetValidationError } from "@/services/fleet-service";
import { ZodError } from "zod";

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const parsedPayload = ImportPayloadSchema.safeParse(rawBody);
    if (!parsedPayload.success) {
      return Response.json(
        {
          error: "Payload invalide.",
          details: parsedPayload.error.issues,
        },
        { status: 400 }
      );
    }

    const body = parsedPayload.data;
    const fleetService = new FleetService();
    const preparedData = fleetService.processExternalData(body.data);
    const auditLog = await fleetService.saveImportAudit(preparedData, {
      userId: body.userId ?? null,
    });

    return Response.json(
      {
        ok: true,
        message: "Import traité et journalisé.",
        auditLogId: auditLog.id,
        provider: preparedData.provider,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof FleetValidationError) {
      return Response.json(
        {
          error: "Payload invalide.",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error("Import API error:", error);
    return Response.json(
      { error: "Impossible de traiter l'import pour le moment." },
      { status: 500 }
    );
  }
}
