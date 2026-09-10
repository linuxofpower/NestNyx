import { All, Body, Controller, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../common/public.decorator';
import { McpService } from './mcp.service';

@Public()
@Controller()
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @All('mcp')
  handleHeaderToken(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ) {
    return this.mcp.handle(req, res, body);
  }

  @All('mcp/:token')
  handlePathToken(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
    @Param('token') token: string,
  ) {
    return this.mcp.handle(req, res, body, token);
  }
}
