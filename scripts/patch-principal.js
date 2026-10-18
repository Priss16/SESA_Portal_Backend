const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../src/pages/principal/PrincipalDashboard.jsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /import \{ DEMO_DEPARTMENTS, getDemoInvigilation, getSubstitutionRequests \} from '\.\.\/\.\.\/utils\/demoStore';/,
  ''
);
content = content.replace(
  /import \{ getRecentActivity \} from '\.\.\/\.\.\/utils\/recentActivityStore';/,
  `import api from '../../services/api';`
);

const oldEffect = `  useEffect(() => {
    const subs = getSubstitutionRequests();
    setStats({
      depts: DEMO_DEPARTMENTS.length,
      exams: 45, // mock
      halls: 30, // mock
      staff: 150, // mock
      subs: subs.filter(s => s.principalStatus === 'Pending Principal Approval').length
    });
    
    setRecentExams([
      { id: 1, subject: 'Programming', code: 'CS101', dept: 'CSE', date: '20 Sep 2026', time: '09:30 AM', status: 'Scheduled' },
      { id: 2, subject: 'Digital Logic', code: 'EC101', dept: 'ECE', date: '22 Sep 2026', time: '14:00 PM', status: 'Scheduled' }
    ]);
    
    setRecentSubs(subs.slice(0, 3));
  }, []);`;

const newEffect = `  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/dashboard/principal');
        if (res.data.success) {
          setStats(res.data.stats);
          setRecentExams(res.data.upcomingExams);
          setRecentSubs(res.data.recentSubs);
          setRecentActivity(res.data.recentActivity);
        }
      } catch (error) {
        console.error('Error fetching principal stats:', error);
      }
    };
    fetchStats();
  }, []);`;

content = content.replace(oldEffect, newEffect);
content = content.replace(/getRecentActivity\('principal'\)/g, 'recentActivity');

fs.writeFileSync(file, content, 'utf8');
console.log("Updated PrincipalDashboard");
