// Unit tests for the academy in the app: reading groups, enrolments and fees, and the requests sent.
import 'dart:convert';

import 'package:akaz_sports_hub/api/academy_models.dart';
import 'package:akaz_sports_hub/api/api_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

http.Response _json(Object body) => http.Response(jsonEncode(body), 200, headers: {'content-type': 'application/json'});

ApiClient _api(Future<http.Response> Function(http.Request) handler) => ApiClient(baseUrl: 'http://api.test', httpClient: MockClient(handler));

void main() {
  test('open groups are read with spots left', () async {
    final api = _api((request) async {
      expect(request.url.path, '/v1/academy/groups');
      return _json([
        {'id': 'g1', 'name': 'U-10', 'sport': 'FOOTBALL', 'age_group': 'U-10', 'coach_name': null, 'weekday': 4, 'starts_at': '17:30',
         'duration_minutes': 60, 'monthly_fee_minor': '15000', 'currency': 'QAR', 'venue_id': 'v1', 'venue_name': 'Arena', 'city': 'Doha', 'spots_left': 3},
      ]);
    });
    final groups = await api.academyGroups();
    expect(groups.single.name, 'U-10');
    expect(groups.single.spotsLeft, 3);
    expect(groups.single.monthlyFeeMinor, 15000);
    expect(groups.single.coachName, isNull);
  });

  test('the manager list works out spots from capacity and enrolled', () {
    final g = AcademyGroup.fromJson({'id': 'g', 'name': 'A', 'sport': 'PADEL', 'weekday': 1, 'starts_at': '18:00', 'duration_minutes': 60,
      'monthly_fee_minor': 100, 'capacity': 10, 'enrolled': 4, 'is_active': false});
    expect(g.spotsLeft, 6);
    expect(g.isActive, false);
  });

  test('enrolling a child sends the child id, and enrolling yourself sends none', () async {
    final bodies = <Map<String, dynamic>>[];
    final api = _api((request) async {
      expect(request.method, 'POST');
      expect(request.url.path, '/v1/academy/groups/g1/enrol');
      bodies.add(jsonDecode(request.body) as Map<String, dynamic>);
      return _json({'id': 'e1'});
    });
    await api.enrolInGroup('g1', childId: 'c1');
    await api.enrolInGroup('g1');
    expect(bodies[0], {'dependent_id': 'c1'});
    expect(bodies[1], isEmpty);
  });

  test('adding a child returns the new profile', () async {
    final api = _api((request) async {
      expect(jsonDecode(request.body), {'full_name': 'Azlan', 'age_group': 'U-10'});
      return _json({'id': 'c9'});
    });
    final child = await api.addChild('Azlan', ageGroup: 'U-10');
    expect(child.id, 'c9');
    expect(child.fullName, 'Azlan');
  });

  test('my enrolments carry attendance and fees due', () async {
    final api = _api((request) async => _json([
          {'id': 'e1', 'status': 'ACTIVE', 'player_name': 'Azlan', 'group_name': 'U-10', 'sport': 'FOOTBALL', 'coach_name': null, 'weekday': 4,
           'starts_at': '17:30', 'duration_minutes': 60, 'monthly_fee_minor': 15000, 'currency': 'QAR', 'venue_name': 'Arena',
           'next_session': '2026-11-26', 'invoices_due': 1, 'attendance': {'present': 2, 'absent': 1, 'excused': 1, 'percent': 67}},
          {'id': 'e2', 'status': 'ENDED', 'player_name': 'Me', 'group_name': 'Padel', 'sport': 'PADEL', 'weekday': 2, 'starts_at': '19:00',
           'monthly_fee_minor': 0, 'currency': 'QAR', 'venue_name': 'Arena', 'next_session': null, 'invoices_due': 0,
           'attendance': {'present': 0, 'absent': 0, 'excused': 0, 'percent': null}},
        ]));
    final list = await api.myEnrolments();
    expect(list[0].attendance.percent, 67);
    expect(list[0].invoicesDue, 1);
    expect(list[0].isActive, true);
    expect(list[1].isActive, false);
    expect(list[1].attendance.percent, isNull);
    expect(list[1].nextSession, isNull);
  });

  test('attendance is saved as one list of marks', () async {
    final api = _api((request) async {
      expect(request.method, 'PUT');
      expect(request.url.path, '/v1/manager/academy/sessions/s1/attendance');
      expect(jsonDecode(request.body), {
        'marks': [
          {'enrolment_id': 'a', 'status': 'PRESENT'},
          {'enrolment_id': 'b', 'status': 'EXCUSED'},
        ],
      });
      return _json({'saved': 2});
    });
    await api.markAcademyAttendance('s1', {'a': 'PRESENT', 'b': 'EXCUSED'});
  });

  test('fees are created for a month and listed', () async {
    final api = _api((request) async {
      if (request.method == 'POST') {
        expect(request.url.path, '/v1/manager/venues/v1/academy/invoices');
        expect(jsonDecode(request.body), {'month': '2026-12'});
        return _json({'created': 5});
      }
      expect(request.url.queryParameters, {'month': '2026-12'});
      return _json([
        {'id': 'i1', 'month': '2026-12', 'amount_minor': '15000', 'currency': 'QAR', 'status': 'DUE', 'player_name': 'Azlan', 'group_name': 'U-10', 'contact_phone': '+97455500020'},
      ]);
    });
    expect(await api.createAcademyInvoices('v1', '2026-12'), 5);
    final invoices = await api.academyInvoices('v1', month: '2026-12');
    expect(invoices.single.amountMinor, 15000);
    expect(invoices.single.status, 'DUE');
  });

  test('paying and waiving use their own routes', () async {
    final seen = <String>[];
    final api = _api((request) async {
      seen.add('${request.method} ${request.url.path} ${request.body}');
      return _json({'id': 'i1'});
    });
    await api.payAcademyInvoice('i1', 'CASH');
    await api.waiveAcademyInvoice('i1');
    expect(seen[0], 'POST /v1/manager/academy/invoices/i1/pay {"method":"CASH"}');
    expect(seen[1], startsWith('POST /v1/manager/academy/invoices/i1/waive'));
  });

  test('parseDay reads a calendar date and refuses anything else', () {
    expect(parseDay('2026-11-26'), DateTime.utc(2026, 11, 26));
    expect(parseDay('26/11/2026'), isNull);
    expect(parseDay(''), isNull);
  });
}
