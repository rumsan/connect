import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppId } from '@rumsan/app';
import { BroadcastService } from './broadcast.service';
import { BroadcastDto, ListBroadcastDto } from './dto/broadcast.dto';

type CsvReply = {
  type: (contentType: string) => CsvReply;
  header: (name: string, value: string) => CsvReply;
  send: (payload: string) => void;
};

@Controller('broadcasts')
@ApiTags('Broadcasts')
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) { }

  @Post()
  @ApiOperation({
    summary: 'Create a new broadcast',
  })
  create(@AppId() appId: string, @Body() dto: BroadcastDto) {
    return this.broadcastService.create(appId, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all broadcasts for the registered app',
  })
  findAll(@AppId() appId: string, @Query() dto: ListBroadcastDto) {
    return this.broadcastService.findAll(appId, dto);
  }

  @Get('status-count')
  getStatusCount(@AppId() appId: string) {
    return this.broadcastService.broadcastStatusCount(appId);
  }

  @Get('download')
  @ApiOperation({
    summary: 'Download broadcasts as a CSV file filtered by appId and optionally sessionId',
  })
  @ApiQuery({ name: 'sessionId', required: false, description: 'Filter by session cuid' })
  async downloadCsv(
    @AppId() appId: string,
    @Query('sessionId') sessionId: string,
    @Res() reply: CsvReply,
  ): Promise<null> {
    const csv = await this.broadcastService.generateBroadcastCsv(appId, sessionId);
    reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="broadcasts.csv"')
      .send(csv);
    return null;
  }

  @Post('list-selected')
  @ApiOperation({
    summary: 'List selected broadcasts based on cuids',
  })
  listSelected(@AppId() appId: string, @Body() broadcastIds: string[]) {
    return this.broadcastService.findSelected(appId, broadcastIds);
  }

  @Get("reports")
  @ApiOperation({
    summary: 'Get all logged items for the registered app.',
  })
  getReports(@AppId() appId: string) {
    console.log(`Fetching reports for app: ${appId}`);
    return this.broadcastService.getReports(appId);
  }

  @Get(':cuid')
  @ApiOperation({
    summary: 'Get a broadcast details with logs by broadcast id',
  })
  findOne(@Param('cuid') cuid: string) {
    return this.broadcastService.findOne(cuid);
  }

  @Get(":xref/reports")
  @ApiOperation({
    summary: 'Get all logged items for the registered app and xref.',
  })
  getReportsByXref(@AppId() appId: string, @Param("xref") xref: string) {
    return this.broadcastService.getReports(appId, xref);
  }


}
